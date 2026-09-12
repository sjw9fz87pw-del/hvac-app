/**
 * Demo data.
 *
 * A realistic restaurant group with two locations, a full equipment inventory,
 * tagged assets, completed service history with proof photos, a customer-added
 * asset awaiting verification, and open issues — enough that every screen shows
 * something real rather than an empty state.
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import { mintTagToken, macPrefix } from "../packages/nfc-core/src/index";
import { hashPassword } from "../src/lib/auth/password";
import { nextDueDate, scheduleStatus } from "../src/lib/maintenance/engine";

const prisma = new PrismaClient();
const TAG_SECRET = process.env.NFC_TAG_SECRET ?? "dev-only-tag-secret-change-in-production-00000000";

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(10, 0, 0, 0);
  return date;
}

async function main() {
  console.log("Seeding…");

  // A clean slate for repeatable demos. Order respects foreign keys.
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

  const company = await prisma.serviceCompany.create({
    data: { name: "Clearline Equipment Care", slug: "clearline" },
  });

  // ---------------------------------------------------------------- service types
  const password = await hashPassword("password123");

  const condenser = await prisma.serviceType.create({
    data: {
      serviceCompanyId: company.id, key: "CONDENSER_CLEANING", name: "Condenser cleaning",
      category: "REFRIGERATION", defaultIntervalDays: 30, estimatedMinutes: 20,
      requiresNfcVerification: true, requiresBeforePhoto: true, requiresAfterPhoto: true, requiresChecklist: true,
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
      requiresNfcVerification: true, requiresBeforePhoto: true, requiresAfterPhoto: true,
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
      category: "WATER_FILTRATION", defaultIntervalDays: 90, estimatedMinutes: 15,
      requiresNfcVerification: true, requiresBeforePhoto: false, requiresAfterPhoto: true,
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
      category: "ICE_MACHINE", defaultIntervalDays: 90, estimatedMinutes: 45,
      requiresNfcVerification: true, requiresBeforePhoto: true, requiresAfterPhoto: true, requiresTechnicianNote: true,
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

  // System-level default plans (the bottom of the override chain).
  await prisma.maintenancePlan.createMany({
    data: [
      { scope: "SYSTEM", serviceTypeId: condenser.id, category: "REFRIGERATION", intervalDays: 30, note: "System default" },
      { scope: "SYSTEM", serviceTypeId: hvacFilter.id, category: "HVAC", intervalDays: 30, note: "System default" },
      { scope: "SYSTEM", serviceTypeId: waterFilter.id, category: "WATER_FILTRATION", intervalDays: 90, note: "System default" },
      { scope: "SYSTEM", serviceTypeId: iceMachine.id, category: "ICE_MACHINE", intervalDays: 90, note: "System default" },
    ],
  });

  await prisma.vendor.createMany({
    data: [
      { serviceCompanyId: company.id, name: "Northside Refrigeration", trade: "REFRIGERATION", phone: "555-0142", contactName: "Dana Petrou" },
      { serviceCompanyId: company.id, name: "Keystone Mechanical", trade: "HVAC", phone: "555-0177" },
    ],
  });

  // ---------------------------------------------------------------- customer
  const monaGroup = await prisma.customerOrganization.create({
    data: { serviceCompanyId: company.id, name: "Mona Restaurant Group", slug: "mona", billingEmail: "ap@monagroup.example" },
  });

  const mona = await prisma.restaurantLocation.create({
    data: {
      organizationId: monaGroup.id, name: "Mona",
      addressLine1: "114 Chestnut Street", city: "Philadelphia", state: "PA", postalCode: "19106",
      phone: "555-0110",
      accessNotes: "Service entrance on the alley. Ask for the GM before 11am; kitchen is closed for prep 2-4pm.",
      areas: {
        create: [
          { name: "Main Kitchen", sortOrder: 0 },
          { name: "Main Bar", sortOrder: 1 },
          { name: "Upstairs Bar", sortOrder: 2 },
          { name: "Walk-In", sortOrder: 3 },
          { name: "Basement", sortOrder: 4 },
        ],
      },
    },
    include: { areas: true },
  });

  const monaEast = await prisma.restaurantLocation.create({
    data: {
      organizationId: monaGroup.id, name: "Mona East",
      addressLine1: "2200 Frankford Avenue", city: "Philadelphia", state: "PA", postalCode: "19125",
      areas: { create: [{ name: "Main Kitchen", sortOrder: 0 }, { name: "Bar", sortOrder: 1 }, { name: "Walk-In", sortOrder: 2 }] },
    },
    include: { areas: true },
  });

  // A customer-level override: this group wants condensers done every 60 days.
  await prisma.maintenancePlan.create({
    data: { scope: "CUSTOMER", serviceTypeId: condenser.id, organizationId: monaGroup.id, intervalDays: 60, note: "Agreed at contract signing" },
  });
  // ...except at the flagship, where the kitchen runs hot. Location beats customer.
  await prisma.maintenancePlan.create({
    data: { scope: "LOCATION", serviceTypeId: condenser.id, locationId: mona.id, intervalDays: 30, note: "High-volume kitchen" },
  });

  // ---------------------------------------------------------------- users
  const [admin, manager, tech, owner, locationManager] = await Promise.all([
    prisma.user.create({ data: { serviceCompanyId: company.id, email: "admin@clearline.example", name: "Alex Rivera", passwordHash: password } }),
    prisma.user.create({ data: { serviceCompanyId: company.id, email: "manager@clearline.example", name: "Sam Okafor", passwordHash: password } }),
    prisma.user.create({ data: { serviceCompanyId: company.id, email: "tech@clearline.example", name: "Jordan Blake", passwordHash: password } }),
    prisma.user.create({ data: { serviceCompanyId: company.id, email: "owner@monagroup.example", name: "Mona Castellano", passwordHash: password } }),
    prisma.user.create({ data: { serviceCompanyId: company.id, email: "gm@monagroup.example", name: "Priya Raman", passwordHash: password } }),
  ]);

  await prisma.membership.createMany({
    data: [
      { userId: admin.id, role: "SUPER_ADMIN" },
      { userId: manager.id, role: "SERVICE_MANAGER" },
      { userId: tech.id, role: "TECHNICIAN" },
      { userId: owner.id, role: "CUSTOMER_ORG_OWNER", organizationId: monaGroup.id },
      // Scoped to one location: this GM must not see Mona East.
      { userId: locationManager.id, role: "CUSTOMER_LOCATION_MANAGER", organizationId: monaGroup.id, locationId: mona.id },
    ],
  });

  // ---------------------------------------------------------------- equipment
  const area = (name: string) => mona.areas.find((a) => a.name === name)!.id;

  interface Spec {
    name: string; areaName: string; category: Prisma.EquipmentCreateInput["category"];
    type: string; manufacturer?: string; model?: string; serial?: string;
    serviceTypeId: string; lastServiceDaysAgo: number | null; tagged?: boolean;
    filterSize?: string; criticality?: Prisma.EquipmentCreateInput["criticality"];
  }

  const specs: Spec[] = [
    { name: "Back Bar Cooler #1", areaName: "Main Bar", category: "REFRIGERATION", type: "Back bar cooler", manufacturer: "True", model: "TBB-24-48", serial: "TBB4419021", serviceTypeId: condenser.id, lastServiceDaysAgo: 12, tagged: true },
    { name: "Back Bar Cooler #2", areaName: "Main Bar", category: "REFRIGERATION", type: "Back bar cooler", manufacturer: "True", model: "TBB-24-48", serial: "TBB4419044", serviceTypeId: condenser.id, lastServiceDaysAgo: 21, tagged: true },
    { name: "Bar Ice Machine", areaName: "Main Bar", category: "ICE_MACHINE", type: "Ice machine", manufacturer: "Manitowoc", model: "IYT0500A", serial: "MTW220041", serviceTypeId: iceMachine.id, lastServiceDaysAgo: 70, tagged: true, criticality: "CRITICAL" },
    { name: "Upstairs Back Bar Cooler", areaName: "Upstairs Bar", category: "REFRIGERATION", type: "Back bar cooler", manufacturer: "Perlick", model: "BBS60", serial: "PRL889210", serviceTypeId: condenser.id, lastServiceDaysAgo: 45, tagged: true },
    { name: "Upstairs Glass Froster", areaName: "Upstairs Bar", category: "REFRIGERATION", type: "Reach-in freezer", manufacturer: "Perlick", model: "BC24", serviceTypeId: condenser.id, lastServiceDaysAgo: 38, tagged: true },
    { name: "Line Prep Table", areaName: "Main Kitchen", category: "REFRIGERATION", type: "Prep table", manufacturer: "Traulsen", model: "UPT6012", serial: "TRL551120", serviceTypeId: condenser.id, lastServiceDaysAgo: 8, tagged: true },
    { name: "Sandwich Prep Table", areaName: "Main Kitchen", category: "REFRIGERATION", type: "Prep table", manufacturer: "Traulsen", model: "UPT4808", serviceTypeId: condenser.id, lastServiceDaysAgo: 33, tagged: true },
    { name: "Reach-In Refrigerator #1", areaName: "Main Kitchen", category: "REFRIGERATION", type: "Reach-in refrigerator", manufacturer: "True", model: "T-49-HC", serial: "TRU9920411", serviceTypeId: condenser.id, lastServiceDaysAgo: 29, tagged: true },
    { name: "Reach-In Freezer #1", areaName: "Main Kitchen", category: "REFRIGERATION", type: "Reach-in freezer", manufacturer: "True", model: "T-49F-HC", serviceTypeId: condenser.id, lastServiceDaysAgo: 41, tagged: true, criticality: "HIGH" },
    { name: "Walk-In Cooler Condenser", areaName: "Walk-In", category: "REFRIGERATION", type: "Walk-in cooler", manufacturer: "Heatcraft", model: "LET090BK", serial: "HCF4410", serviceTypeId: condenser.id, lastServiceDaysAgo: 52, tagged: true, criticality: "CRITICAL" },
    { name: "Walk-In Freezer Condenser", areaName: "Walk-In", category: "REFRIGERATION", type: "Walk-in freezer", manufacturer: "Heatcraft", model: "LET120BK", serviceTypeId: condenser.id, lastServiceDaysAgo: 52, tagged: true, criticality: "CRITICAL" },
    { name: "Kitchen HVAC Unit", areaName: "Basement", category: "HVAC", type: "HVAC unit", manufacturer: "Carrier", model: "48TC", serviceTypeId: hvacFilter.id, lastServiceDaysAgo: 26, tagged: true, filterSize: "20x25x2" },
    { name: "Dining Room HVAC Unit", areaName: "Basement", category: "HVAC", type: "HVAC unit", manufacturer: "Carrier", model: "48TC", serviceTypeId: hvacFilter.id, lastServiceDaysAgo: 26, tagged: true, filterSize: "20x25x2" },
    { name: "Main Water Filtration", areaName: "Basement", category: "WATER_FILTRATION", type: "Water filtration", manufacturer: "3M", model: "SGLP200-CL", serviceTypeId: waterFilter.id, lastServiceDaysAgo: 84, tagged: true },
    // Deliberately untagged, so "Assets without NFC tags" is not an empty list.
    { name: "Dessert Reach-In", areaName: "Main Kitchen", category: "REFRIGERATION", type: "Reach-in refrigerator", manufacturer: "Beverage-Air", model: "HR1-1S", serviceTypeId: condenser.id, lastServiceDaysAgo: null, tagged: false },
  ];

  const created: { id: string; name: string; areaId: string; serviceTypeId: string; lastServiceDaysAgo: number | null }[] = [];

  for (const [index, spec] of specs.entries()) {
    const equipment = await prisma.equipment.create({
      data: {
        organizationId: monaGroup.id, locationId: mona.id, areaId: area(spec.areaName),
        name: spec.name, category: spec.category, equipmentType: spec.type,
        manufacturer: spec.manufacturer ?? null, model: spec.model ?? null, serialNumber: spec.serial ?? null,
        internalAssetId: `MONA-${String(index + 1).padStart(4, "0")}`,
        criticality: spec.criticality ?? "STANDARD",
        condition: spec.lastServiceDaysAgo !== null && spec.lastServiceDaysAgo < 30 ? "GOOD" : "FAIR",
        filterSize: spec.filterSize ?? null,
        technicianNotes: spec.name.includes("Walk-In Cooler")
          ? "Condenser is mounted high — bring the 8ft ladder. Coil fins bent on the left corner since install."
          : null,
        createdById: tech.id, createdBySource: "INTERNAL", verifiedAt: new Date(), verifiedById: tech.id,
      },
    });

    // Interval comes from the override chain: location (30) beats customer (60)
    // beats system (30) for condensers at this location.
    const plans = await prisma.maintenancePlan.findMany({
      where: {
        serviceTypeId: spec.serviceTypeId, active: true,
        OR: [
          { scope: "SYSTEM", category: spec.category },
          { scope: "CUSTOMER", organizationId: monaGroup.id },
          { scope: "LOCATION", locationId: mona.id },
        ],
      },
    });
    const precedence = { SYSTEM: 0, CUSTOMER: 1, LOCATION: 2, ASSET: 3 } as const;
    const best = plans.sort((a, b) => precedence[a.scope] - precedence[b.scope]).at(-1);
    const intervalDays = best?.intervalDays ?? 30;

    const lastServiceAt = spec.lastServiceDaysAgo !== null ? daysAgo(spec.lastServiceDaysAgo) : null;
    const nextDueAt = lastServiceAt ? nextDueDate(lastServiceAt, intervalDays) : new Date();

    await prisma.maintenanceSchedule.create({
      data: {
        equipmentId: equipment.id, serviceTypeId: spec.serviceTypeId, intervalDays,
        intervalSource: best?.scope ?? "SYSTEM", lastServiceAt, nextDueAt,
        status: scheduleStatus({ nextDueAt }),
      },
    });

    if (spec.tagged) {
      const token = mintTagToken(TAG_SECRET, { tenantId: monaGroup.id });
      const tag = await prisma.tag.create({
        data: {
          organizationId: monaGroup.id, tokenId: token.tokenId, macPrefix: macPrefix(token),
          tenantHint: token.tenantHint, state: "ACTIVE", label: `BATCH-A-${String(index + 1).padStart(3, "0")}`,
          writtenAt: daysAgo(120), verifiedAt: daysAgo(120),
          assignments: { create: { equipmentId: equipment.id, assignedById: tech.id, assignedAt: daysAgo(120) } },
          events: {
            create: [
              { type: "MINTED", actorId: tech.id, createdAt: daysAgo(120) },
              { type: "WRITTEN", actorId: tech.id, createdAt: daysAgo(120) },
              { type: "VERIFIED", actorId: tech.id, createdAt: daysAgo(120) },
              { type: "PAIRED", actorId: tech.id, equipmentId: equipment.id, createdAt: daysAgo(120) },
            ],
          },
        },
      });
      await prisma.auditEvent.create({
        data: {
          action: "tag.assigned", entityType: "Equipment", entityId: equipment.id,
          actorId: tech.id, organizationId: monaGroup.id, detail: { tagId: tag.id }, createdAt: daysAgo(120),
        },
      });
    }

    await prisma.auditEvent.create({
      data: {
        action: "asset.created", entityType: "Equipment", entityId: equipment.id,
        actorId: tech.id, organizationId: monaGroup.id,
        after: { name: equipment.name, internalAssetId: equipment.internalAssetId }, createdAt: daysAgo(120),
      },
    });

    created.push({ id: equipment.id, name: equipment.name, areaId: equipment.areaId!, serviceTypeId: spec.serviceTypeId, lastServiceDaysAgo: spec.lastServiceDaysAgo });
  }

  // A damaged tag that was replaced — so tag history has something real in it.
  const replacedAsset = created[0];
  const oldToken = mintTagToken(TAG_SECRET, { tenantId: monaGroup.id });
  await prisma.tag.create({
    data: {
      organizationId: monaGroup.id, tokenId: oldToken.tokenId, macPrefix: macPrefix(oldToken),
      tenantHint: oldToken.tenantHint, state: "REVOKED", label: "BATCH-A-001-OLD",
      writtenAt: daysAgo(300), verifiedAt: daysAgo(300),
      revokedAt: daysAgo(120), revokedReason: "Tag damaged by cleaning chemicals",
      assignments: { create: { equipmentId: replacedAsset.id, assignedById: tech.id, assignedAt: daysAgo(300), unassignedAt: daysAgo(120), unassignedById: tech.id, unassignReason: "Tag damaged by cleaning chemicals" } },
      events: {
        create: [
          { type: "MINTED", actorId: tech.id, createdAt: daysAgo(300) },
          { type: "PAIRED", actorId: tech.id, equipmentId: replacedAsset.id, createdAt: daysAgo(300) },
          { type: "REPLACED", actorId: tech.id, equipmentId: replacedAsset.id, detail: { reason: "Tag damaged by cleaning chemicals" }, createdAt: daysAgo(120) },
        ],
      },
    },
  });

  // Mona East, lighter inventory.
  for (const [index, spec] of [
    { name: "Bar Cooler", areaName: "Bar", type: "Back bar cooler", days: 18 },
    { name: "Line Prep Table", areaName: "Main Kitchen", type: "Prep table", days: 24 },
    { name: "Walk-In Condenser", areaName: "Walk-In", type: "Walk-in cooler", days: 62 },
  ].entries()) {
    const equipment = await prisma.equipment.create({
      data: {
        organizationId: monaGroup.id, locationId: monaEast.id,
        areaId: monaEast.areas.find((a) => a.name === spec.areaName)!.id,
        name: spec.name, category: "REFRIGERATION", equipmentType: spec.type,
        internalAssetId: `MONA-${String(100 + index).padStart(4, "0")}`,
        createdById: tech.id, verifiedAt: new Date(), verifiedById: tech.id,
      },
    });
    const lastServiceAt = daysAgo(spec.days);
    const nextDueAt = nextDueDate(lastServiceAt, 60);
    await prisma.maintenanceSchedule.create({
      data: {
        equipmentId: equipment.id, serviceTypeId: condenser.id, intervalDays: 60,
        intervalSource: "CUSTOMER", lastServiceAt, nextDueAt, status: scheduleStatus({ nextDueAt }),
      },
    });
  }

  // A unit the customer added themselves, waiting on our verification.
  const pending = await prisma.equipment.create({
    data: {
      organizationId: monaGroup.id, locationId: mona.id, areaId: area("Main Bar"),
      name: "New Undercounter Fridge", category: "REFRIGERATION", equipmentType: "Reach-in refrigerator",
      manufacturer: "True", model: "TUC-27", internalAssetId: "MONA-0200",
      status: "PENDING_SETUP", createdById: owner.id, createdBySource: "CUSTOMER",
      customerVisibleNotes: "Delivered last week, replaced the old one under the service well.",
    },
  });
  await prisma.notification.create({
    data: {
      userId: manager.id, type: "CUSTOMER_ADDED_EQUIPMENT",
      title: "New equipment awaiting setup",
      body: `${pending.name} — Mona Restaurant Group, Mona`,
      link: `/admin/equipment/${pending.id}`, dedupeKey: `pending-setup:${pending.id}`,
    },
  });

  // ---------------------------------------------------------------- service history
  for (const asset of created.filter((a) => a.lastServiceDaysAgo !== null)) {
    const performedAt = daysAgo(asset.lastServiceDaysAgo!);
    const serviceType = await prisma.serviceType.findUniqueOrThrow({
      where: { id: asset.serviceTypeId }, include: { checklistItems: true },
    });
    const schedule = await prisma.maintenanceSchedule.findFirstOrThrow({ where: { equipmentId: asset.id } });

    await prisma.serviceRecord.create({
      data: {
        organizationId: monaGroup.id, locationId: mona.id, equipmentId: asset.id,
        serviceTypeId: serviceType.id, technicianId: tech.id,
        performedAt, durationMinutes: serviceType.estimatedMinutes,
        technicianNotes: "Coil was heavily loaded with grease film. Recommend tightening the interval if it looks the same next visit.",
        customerVisibleNotes: "Condenser cleaned and airflow verified. No issues found.",
        nextDueAt: schedule.nextDueAt, nfcVerified: true, verificationMethod: "NFC",
        checklistResults: serviceType.checklistItems.map((item) => ({ label: item.label, completed: true })) as unknown as Prisma.InputJsonValue,
        contentHash: `seed-${asset.id}`,
        createdAt: performedAt,
      },
    });

    await prisma.auditEvent.create({
      data: {
        action: "service.completed", entityType: "Equipment", entityId: asset.id,
        actorId: tech.id, organizationId: monaGroup.id, createdAt: performedAt,
      },
    });
  }

  // ---------------------------------------------------------------- work
  const dueSchedules = await prisma.maintenanceSchedule.findMany({
    where: { equipment: { locationId: mona.id }, nextDueAt: { lte: new Date(Date.now() + 7 * 86_400_000) } },
    include: { equipment: { include: { area: true } }, serviceType: true },
  });

  if (dueSchedules.length > 0) {
    const today = new Date(); today.setHours(9, 0, 0, 0);
    dueSchedules.sort((a, b) => (a.equipment.area?.sortOrder ?? 99) - (b.equipment.area?.sortOrder ?? 99));

    await prisma.visit.create({
      data: {
        organizationId: monaGroup.id, locationId: mona.id, technicianId: tech.id,
        scheduledFor: today, status: "SCHEDULED",
        estimatedMinutes: dueSchedules.reduce((sum, s) => sum + s.serviceType.estimatedMinutes, 0),
        tasks: {
          create: dueSchedules.map((schedule, index) => ({
            equipmentId: schedule.equipmentId, serviceTypeId: schedule.serviceTypeId,
            scheduleId: schedule.id, sortOrder: index,
          })),
        },
      },
    });
  }

  // ---------------------------------------------------------------- issues
  const noisyUnit = created.find((c) => c.name === "Bar Ice Machine")!;
  await prisma.issue.create({
    data: {
      organizationId: monaGroup.id, locationId: mona.id, equipmentId: noisyUnit.id,
      source: "TECHNICIAN", category: "MAKING_NOISE", severity: "HIGH", status: "TRIAGED",
      title: "Making noise — Bar Ice Machine",
      description: "Compressor is noticeably louder than on the last two visits. Production still normal. Worth having a refrigeration contractor look before it fails over a weekend.",
      reportedById: tech.id,
      events: { create: { actorId: tech.id, type: "CREATED", body: "Flagged during routine cleaning" } },
      createdAt: daysAgo(6),
    },
  });

  const warmUnit = created.find((c) => c.name === "Reach-In Freezer #1")!;
  await prisma.issue.create({
    data: {
      organizationId: monaGroup.id, locationId: mona.id, equipmentId: warmUnit.id,
      source: "CUSTOMER", category: "ICE_BUILDUP", severity: "MEDIUM", status: "OPEN",
      title: "Ice build-up — Reach-In Freezer #1",
      description: "Heavy frost on the back wall again, third time this month. Door seems to seal fine.",
      reportedById: locationManager.id,
      events: { create: { actorId: locationManager.id, type: "CREATED" } },
      createdAt: daysAgo(2),
    },
  });

  // ---------------------------------------------------------------- commercial (dormant)
  const plan = await prisma.servicePlan.create({
    data: {
      serviceCompanyId: company.id, name: "Preventive Care — Standard",
      description: "Recurring preventive maintenance across refrigeration, HVAC filters, water filtration and ice machines.",
      basePriceCents: 0, perAssetCents: 1800, perLocationCents: 9900,
      lineItems: {
        create: [
          { serviceTypeId: condenser.id, category: "REFRIGERATION", intervalDays: 30, unitPriceCents: 1800 },
          { serviceTypeId: hvacFilter.id, category: "HVAC", intervalDays: 30, unitPriceCents: 1500 },
          { serviceTypeId: waterFilter.id, category: "WATER_FILTRATION", intervalDays: 90, unitPriceCents: 3200 },
          { serviceTypeId: iceMachine.id, category: "ICE_MACHINE", intervalDays: 90, unitPriceCents: 8500 },
        ],
      },
    },
  });
  await prisma.subscription.create({
    data: { organizationId: monaGroup.id, servicePlanId: plan.id, status: "ACTIVE", startedAt: daysAgo(300) },
  });

  const counts = {
    equipment: await prisma.equipment.count(),
    tags: await prisma.tag.count(),
    services: await prisma.serviceRecord.count(),
    issues: await prisma.issue.count(),
  };

  console.log("Seeded:", counts);
  console.log("\nSign in with any of these (password: password123):");
  console.log("  admin@clearline.example    Super Admin");
  console.log("  manager@clearline.example  Service Manager");
  console.log("  tech@clearline.example     Technician");
  console.log("  owner@monagroup.example    Customer Org Owner (both locations)");
  console.log("  gm@monagroup.example       Customer Location Manager (Mona only)");
}

main()
  .catch((error) => { console.error(error); process.exit(1); })
  .finally(() => prisma.$disconnect());
