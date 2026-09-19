/**
 * The real starting dataset for this deployment.
 *
 * This replaces the old demo fixture. Everything in here is something the
 * operator actually told us; nothing is padded out to make screens look busy.
 * Where a detail is genuinely unknown (model numbers, serials, install dates)
 * the field is left null rather than filled with a plausible guess — an
 * equipment passport that quietly invents its own contents is worse than an
 * empty one.
 *
 * Shared by the CLI seed and the guarded bootstrap endpoint. The password and
 * owner email are parameters so a deployed environment never ends up with a
 * well-known development password on it.
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import { hashPassword } from "@/lib/auth/password";
import { serviceContentHash } from "@/lib/maintenance/completion";
import { nextDueDate, scheduleStatus } from "@/lib/maintenance/engine";

/** The operator's actual cadence: every two months. */
export const CONDENSER_INTERVAL_DAYS = 60;

/**
 * Placeholder name for the customer group that owns the restaurants. It is a
 * container, not a claim about anyone's business — rename it in Settings.
 */
export const DEFAULT_GROUP_NAME = "My Restaurants";

export interface SetupOptions {
  ownerEmail: string;
  ownerName?: string;
  /** When the twelve units were serviced. Defaults to now. */
  performedAt?: Date;
}

export interface SetupResult {
  counts: { organizations: number; locations: number; equipment: number; services: number };
  ownerEmail: string;
  locationName: string;
}

/** Every table, in an order that respects foreign keys. */
async function wipe(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction([
    prisma.servicePhoto.deleteMany(), prisma.issueEvent.deleteMany(), prisma.issuePhoto.deleteMany(),
    prisma.issue.deleteMany(), prisma.serviceRecord.deleteMany(), prisma.visitTask.deleteMany(),
    prisma.visit.deleteMany(), prisma.maintenanceSchedule.deleteMany(), prisma.maintenancePlan.deleteMany(),
    prisma.checklistItemTemplate.deleteMany(), prisma.tagEvent.deleteMany(), prisma.tagAssignment.deleteMany(),
    prisma.tag.deleteMany(), prisma.equipmentPhoto.deleteMany(), prisma.equipmentDocument.deleteMany(),
    prisma.subscriptionAsset.deleteMany(), prisma.subscription.deleteMany(), prisma.planLineItem.deleteMany(),
    prisma.servicePlan.deleteMany(), prisma.aiExtraction.deleteMany(), prisma.partUsage.deleteMany(),
    prisma.repairCost.deleteMany(), prisma.sensorReading.deleteMany(), prisma.sensorDevice.deleteMany(),
    prisma.equipment.deleteMany(), prisma.area.deleteMany(), prisma.notification.deleteMany(),
    prisma.notificationPreference.deleteMany(), prisma.auditEvent.deleteMany(), prisma.idempotencyKey.deleteMany(),
    prisma.syncBatch.deleteMany(), prisma.session.deleteMany(), prisma.membership.deleteMany(),
    prisma.serviceType.deleteMany(), prisma.vendor.deleteMany(), prisma.restaurantLocation.deleteMany(),
    prisma.customerOrganization.deleteMany(), prisma.user.deleteMany(), prisma.serviceCompany.deleteMany(),
  ]);
}

/**
 * Wipes and installs the real dataset. Destructive by design — callers have to
 * be deliberate about when they run it.
 */
export async function installInitialData(
  prisma: PrismaClient,
  plainPassword: string,
  options: SetupOptions,
): Promise<SetupResult> {
  const performedAt = options.performedAt ?? new Date();

  await wipe(prisma);

  const company = await prisma.serviceCompany.create({
    data: { name: "Clearline Equipment Care", slug: "clearline" },
  });

  // ------------------------------------------------------------ service types
  // The four lines of work this company sells. Only condenser cleaning has
  // assets against it today; the others exist so units can be added to them
  // without a schema change.
  const condenser = await prisma.serviceType.create({
    data: {
      serviceCompanyId: company.id, key: "CONDENSER_CLEANING", name: "Condenser cleaning",
      category: "REFRIGERATION", defaultIntervalDays: CONDENSER_INTERVAL_DAYS, estimatedMinutes: 20,
      requiresNfcVerification: false, requiresBeforePhoto: true, requiresAfterPhoto: true, requiresChecklist: true,
      checklistItems: {
        create: [
          { label: "Inspect condenser coil", sortOrder: 0 },
          { label: "Take before photo", sortOrder: 1, inputType: "PHOTO" },
          { label: "Clean condenser", sortOrder: 2 },
          { label: "Inspect airflow", sortOrder: 3 },
          { label: "Inspect for visible damage", sortOrder: 4 },
          { label: "Take after photo", sortOrder: 5, inputType: "PHOTO" },
          { label: "Check door seals", sortOrder: 6, required: false },
        ],
      },
    },
  });

  const hvacFilter = await prisma.serviceType.create({
    data: {
      serviceCompanyId: company.id, key: "HVAC_FILTER", name: "HVAC filter replacement",
      category: "HVAC", defaultIntervalDays: 30, estimatedMinutes: 15,
      requiresNfcVerification: false, requiresBeforePhoto: true, requiresAfterPhoto: true,
      checklistItems: {
        create: [
          { label: "Check filter condition", sortOrder: 0 },
          { label: "Replace filter", sortOrder: 1 },
          { label: "Record filter size", sortOrder: 2, inputType: "NOTE", required: false },
          { label: "Check airflow", sortOrder: 3 },
        ],
      },
    },
  });

  const waterFilter = await prisma.serviceType.create({
    data: {
      serviceCompanyId: company.id, key: "WATER_FILTER", name: "Water filter replacement",
      category: "WATER_FILTRATION", defaultIntervalDays: 180, estimatedMinutes: 15,
      requiresNfcVerification: false, requiresBeforePhoto: false, requiresAfterPhoto: true,
      checklistItems: {
        create: [
          { label: "Shut off supply", sortOrder: 0 },
          { label: "Replace cartridge", sortOrder: 1 },
          { label: "Flush line", sortOrder: 2 },
          { label: "Check for leaks", sortOrder: 3 },
        ],
      },
    },
  });

  const iceMachine = await prisma.serviceType.create({
    data: {
      serviceCompanyId: company.id, key: "ICE_MACHINE_CLEANING", name: "Ice machine cleaning",
      category: "ICE_MACHINE", defaultIntervalDays: 180, estimatedMinutes: 45,
      requiresNfcVerification: false, requiresBeforePhoto: true, requiresAfterPhoto: true, requiresTechnicianNote: true,
      checklistItems: {
        create: [
          { label: "Power down and drain", sortOrder: 0 },
          { label: "Remove and sanitise components", sortOrder: 1 },
          { label: "Descale evaporator", sortOrder: 2 },
          { label: "Clean condenser", sortOrder: 3 },
          { label: "Sanitise bin", sortOrder: 4 },
          { label: "Restart and verify production", sortOrder: 5 },
        ],
      },
    },
  });

  // System defaults — the bottom of the interval override chain. Refrigeration
  // sits at two months because that is the cadence actually being run, so any
  // unit added later inherits it without anyone remembering to set it.
  await prisma.maintenancePlan.createMany({
    data: [
      { scope: "SYSTEM", serviceTypeId: condenser.id, category: "REFRIGERATION", intervalDays: CONDENSER_INTERVAL_DAYS, note: "Every two months" },
      { scope: "SYSTEM", serviceTypeId: hvacFilter.id, category: "HVAC", intervalDays: 30, note: "System default" },
      { scope: "SYSTEM", serviceTypeId: waterFilter.id, category: "WATER_FILTRATION", intervalDays: 180, note: "System default" },
      { scope: "SYSTEM", serviceTypeId: iceMachine.id, category: "ICE_MACHINE", intervalDays: 180, note: "System default" },
    ],
  });

  // ------------------------------------------------------------------- owner
  const passwordHash = await hashPassword(plainPassword);
  const owner = await prisma.user.create({
    data: {
      serviceCompanyId: company.id,
      email: options.ownerEmail.toLowerCase(),
      name: options.ownerName ?? "Owner",
      passwordHash,
    },
  });
  await prisma.membership.create({ data: { userId: owner.id, role: "SUPER_ADMIN" } });

  // --------------------------------------------------------------- customer
  const group = await prisma.customerOrganization.create({
    data: { serviceCompanyId: company.id, name: DEFAULT_GROUP_NAME, slug: "restaurants" },
  });

  const location = await prisma.restaurantLocation.create({
    data: {
      organizationId: group.id,
      name: "New Restaurant",
      areas: { create: [{ name: "Kitchen", sortOrder: 0 }, { name: "Bar", sortOrder: 1 }] },
    },
    include: { areas: true },
  });

  const kitchen = location.areas.find((a) => a.name === "Kitchen")!;
  const bar = location.areas.find((a) => a.name === "Bar")!;

  // ------------------------------------------------------------- equipment
  // Twelve units, which is what was actually serviced: ten in the kitchen and
  // two behind the bar. Make, model and serial are unknown and stay unknown.
  const specs: { name: string; areaId: string; type: string; assetId: string }[] = [
    ...Array.from({ length: 10 }, (_, i) => ({
      name: `Kitchen Refrigerator ${i + 1}`,
      areaId: kitchen.id,
      type: "Refrigerator",
      assetId: `NR-KIT-${String(i + 1).padStart(2, "0")}`,
    })),
    ...Array.from({ length: 2 }, (_, i) => ({
      name: `Back Bar Cooler ${i + 1}`,
      areaId: bar.id,
      type: "Back Bar Cooler",
      assetId: `NR-BAR-${String(i + 1).padStart(2, "0")}`,
    })),
  ];

  const nextDueAt = nextDueDate(performedAt, CONDENSER_INTERVAL_DAYS);
  const checklist = await prisma.checklistItemTemplate.findMany({
    where: { serviceTypeId: condenser.id }, orderBy: { sortOrder: "asc" },
  });
  const checklistResults = checklist.map((item) => ({ label: item.label, completed: true }));

  let services = 0;

  for (const spec of specs) {
    const equipment = await prisma.equipment.create({
      data: {
        organizationId: group.id,
        locationId: location.id,
        areaId: spec.areaId,
        name: spec.name,
        category: "REFRIGERATION",
        equipmentType: spec.type,
        internalAssetId: spec.assetId,
        status: "ACTIVE",
        condition: "UNKNOWN",
        criticality: "STANDARD",
        createdById: owner.id,
        createdBySource: "INTERNAL",
        verifiedAt: performedAt,
        verifiedById: owner.id,
      },
    });

    await prisma.maintenanceSchedule.create({
      data: {
        equipmentId: equipment.id,
        serviceTypeId: condenser.id,
        intervalDays: CONDENSER_INTERVAL_DAYS,
        intervalSource: "SYSTEM",
        lastServiceAt: performedAt,
        nextDueAt,
        status: scheduleStatus({ nextDueAt }),
      },
    });

    // The completed work. Recorded as MANUAL because it was done before any
    // tag was on the equipment — claiming NFC verification here would be a lie
    // told by the system of record.
    await prisma.serviceRecord.create({
      data: {
        organizationId: group.id,
        locationId: location.id,
        equipmentId: equipment.id,
        serviceTypeId: condenser.id,
        technicianId: owner.id,
        performedAt,
        durationMinutes: null,
        nextDueAt,
        nfcVerified: false,
        verificationMethod: "MANUAL",
        checklistResults: checklistResults as unknown as Prisma.InputJsonValue,
        contentHash: serviceContentHash({
          equipmentId: equipment.id,
          serviceTypeId: condenser.id,
          technicianId: owner.id,
          performedAt,
          checklist: checklistResults,
          photoKeys: [],
        }),
        createdAt: performedAt,
      },
    });

    await prisma.auditEvent.create({
      data: {
        action: "service.completed", entityType: "Equipment", entityId: equipment.id,
        actorId: owner.id, organizationId: group.id, createdAt: performedAt,
      },
    });

    services += 1;
  }

  return {
    counts: { organizations: 1, locations: 1, equipment: specs.length, services },
    ownerEmail: owner.email,
    locationName: location.name,
  };
}
