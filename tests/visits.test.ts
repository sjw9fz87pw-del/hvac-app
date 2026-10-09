/**
 * A visit's status follows its work.
 *
 * Before this, nothing ever moved a visit out of Scheduled: finished visits
 * were reported as missed the next day, and the customer's service report —
 * which waits for a completed visit — never appeared.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { capabilitiesFor } from "@/lib/auth/permissions";
import type { Actor } from "@/lib/auth/session";
import { completeService, supersedeService } from "@/lib/maintenance/completion";
import { reconcileVisits, generateVisit } from "@/lib/maintenance/scheduling";
import { changeVisit } from "@/lib/api/visits";

const prisma = new PrismaClient();
const stamp = Date.now();
let companyId: string, orgId: string, locId: string, userId: string, typeId: string;
const units: string[] = [];

function tech(): Actor {
  const roles = ["SUPER_ADMIN"] as Actor["roles"];
  return {
    userId, name: "Tech", email: "t@x.example", serviceCompanyId: companyId,
    roles, capabilities: capabilitiesFor(roles), internal: true,
    organizationIds: new Set([orgId]), locationIds: null,
  };
}

/** No proof required, so these tests are about visits, not evidence. */
const done = (equipmentId: string, extra: Partial<Parameters<typeof completeService>[0]> = {}) =>
  completeService({
    equipmentId, serviceTypeId: typeId, performedAt: new Date(),
    checklist: [], photos: [], verificationMethod: "MANUAL", ...extra,
  }, tech());

async function bookVisit(unitIds: string[], scheduledFor = new Date()) {
  return prisma.visit.create({
    data: {
      organizationId: orgId, locationId: locId, scheduledFor, status: "SCHEDULED",
      tasks: { create: unitIds.map((equipmentId, i) => ({ equipmentId, serviceTypeId: typeId, sortOrder: i })) },
    },
    include: { tasks: true },
  });
}

beforeAll(async () => {
  companyId = (await prisma.serviceCompany.create({ data: { name: "Visits Co", slug: `visits-${stamp}` } })).id;
  userId = (await prisma.user.create({
    data: { serviceCompanyId: companyId, email: `visits-${stamp}@x.example`, name: "Tech", passwordHash: "x" },
  })).id;
  orgId = (await prisma.customerOrganization.create({
    data: { serviceCompanyId: companyId, name: "Visits Org", slug: `visits-org-${stamp}` },
  })).id;
  locId = (await prisma.restaurantLocation.create({ data: { organizationId: orgId, name: "Visits Place" } })).id;
  typeId = (await prisma.serviceType.create({
    data: {
      serviceCompanyId: companyId, key: `V-${stamp}`, name: "Visit test job", category: "OTHER",
      defaultIntervalDays: 30, requiresNfcVerification: false, requiresBeforePhoto: false,
      requiresAfterPhoto: false, requiresChecklist: false,
    },
  })).id;
  // An internal membership, so this user can be assigned visits.
  await prisma.membership.create({ data: { userId, role: "SUPER_ADMIN" } });
  for (let i = 0; i < 9; i++) {
    units.push((await prisma.equipment.create({
      data: {
        organizationId: orgId, locationId: locId, name: `V Unit ${i}`, category: "OTHER",
        equipmentType: "Test", internalAssetId: `V-${i}-${stamp}`,
      },
    })).id);
  }
});

afterAll(async () => {
  await prisma.serviceRecord.updateMany({ where: { organizationId: orgId }, data: { supersedesId: null } });
  await prisma.servicePhoto.deleteMany({ where: { serviceRecord: { organizationId: orgId } } });
  await prisma.serviceRecord.deleteMany({ where: { organizationId: orgId } });
  await prisma.visitTask.deleteMany({ where: { visit: { organizationId: orgId } } });
  await prisma.visit.deleteMany({ where: { organizationId: orgId } });
  await prisma.maintenanceSchedule.deleteMany({ where: { equipment: { organizationId: orgId } } });
  await prisma.auditEvent.deleteMany({ where: { OR: [{ actorId: userId }, { organizationId: orgId }] } });
  await prisma.equipment.deleteMany({ where: { organizationId: orgId } });
  await prisma.restaurantLocation.deleteMany({ where: { organizationId: orgId } });
  await prisma.customerOrganization.deleteMany({ where: { id: orgId } });
  await prisma.serviceType.deleteMany({ where: { id: typeId } });
  await prisma.membership.deleteMany({ where: { userId } });
  await prisma.notification.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.serviceCompany.deleteMany({ where: { id: companyId } });
  await prisma.$disconnect();
});

const status = async (id: string) => (await prisma.visit.findUniqueOrThrow({ where: { id } })).status;

describe("visit status follows the work", () => {
  it("goes in progress with the first unit and completed with the last", async () => {
    const visit = await bookVisit([units[0], units[1]]);
    expect(await status(visit.id)).toBe("SCHEDULED");

    await done(units[0], { visitTaskId: visit.tasks[0].id });
    expect(await status(visit.id)).toBe("IN_PROGRESS");

    await done(units[1], { visitTaskId: visit.tasks[1].id });
    const finished = await prisma.visit.findUniqueOrThrow({ where: { id: visit.id } });
    expect(finished.status).toBe("COMPLETED");
    expect(finished.completedAt).not.toBeNull();
    // The record knows which visit it belongs to, which is what the report reads.
    expect(await prisma.serviceRecord.count({ where: { visitId: visit.id } })).toBe(2);
  });

  it("finishes a booked visit when the whole restaurant is recorded at once", async () => {
    const visit = await bookVisit([units[2]]);
    await done(units[2], { attachToOpenVisit: true });
    expect(await status(visit.id)).toBe("COMPLETED");
  });

  it("never lets a correction complete a visit", async () => {
    const original = await done(units[3]);
    const visit = await bookVisit([units[3]]);
    await supersedeService(original.id, {
      equipmentId: units[3], serviceTypeId: typeId, performedAt: new Date(),
      checklist: [], photos: [], verificationMethod: "MANUAL",
    }, "Fixed the time", tech());
    expect(await status(visit.id)).toBe("SCHEDULED");
  });

  it("repairs visits that finished before visits were settled", async () => {
    const visit = await bookVisit([units[4]]);
    // The old behaviour: the task completed, the visit left untouched.
    await prisma.visitTask.update({ where: { id: visit.tasks[0].id }, data: { status: "COMPLETED", completedAt: new Date() } });
    expect(await status(visit.id)).toBe("SCHEDULED");

    expect(await reconcileVisits()).toBeGreaterThanOrEqual(1);
    expect(await status(visit.id)).toBe("COMPLETED");
  });

  it("leaves a visit with work still to do alone", async () => {
    const visit = await bookVisit([units[5]]);
    await reconcileVisits();
    expect(await status(visit.id)).toBe("SCHEDULED");
  });
});

describe("booking and changing visits", () => {
  it("does not book a unit that is already on a booked visit", async () => {
    // Units 6-8 get schedules so the generator has work to book.
    for (const id of units.slice(6)) {
      await prisma.maintenanceSchedule.create({
        data: { equipmentId: id, serviceTypeId: typeId, intervalDays: 30, intervalSource: "SYSTEM", nextDueAt: new Date(), status: "DUE" },
      });
    }
    const first = await generateVisit({ locationId: locId, scheduledFor: new Date(), include: "all" });
    const covered = new Set(first?.tasks.map((t) => t.equipmentId));
    for (const id of units.slice(6)) expect(covered.has(id)).toBe(true);
    // Unit 5 sits on an open visit from an earlier test, so it is left off this one.
    expect(covered.has(units[5])).toBe(false);

    await expect(generateVisit({ locationId: locId, scheduledFor: new Date(), include: "all" }))
      .rejects.toMatchObject({ message: expect.stringMatching(/already on a booked visit/) });
  });

  it("moves and assigns a visit, and refuses someone who can't be sent", async () => {
    const visit = await bookVisit([units[0]], new Date("2030-01-01T14:00:00Z"));
    const when = new Date("2030-02-03T15:00:00Z");
    await changeVisit(visit.id, { scheduledFor: when, technicianId: userId }, tech());
    const moved = await prisma.visit.findUniqueOrThrow({ where: { id: visit.id } });
    expect(moved.scheduledFor.toISOString()).toBe(when.toISOString());
    expect(moved.technicianId).toBe(userId);

    await expect(changeVisit(visit.id, { technicianId: "nobody" }, tech())).rejects.toMatchObject({ status: 409 });
  });

  it("cancels a visit nobody has started, and puts its units back to needing one", async () => {
    const visit = await bookVisit([units[1]]);
    await changeVisit(visit.id, { cancel: true }, tech());
    const after = await prisma.visit.findUniqueOrThrow({ where: { id: visit.id }, include: { tasks: true } });
    expect(after.status).toBe("CANCELLED");
    expect(after.tasks.every((t) => t.status === "SKIPPED")).toBe(true);
    // And a cancelled visit can't be changed again.
    await expect(changeVisit(visit.id, { scheduledFor: new Date() }, tech())).rejects.toMatchObject({ status: 409 });
  });

  it("will not cancel a visit with work already recorded", async () => {
    const visit = await bookVisit([units[2], units[3]]);
    await done(units[2], { visitTaskId: visit.tasks[0].id });
    await expect(changeVisit(visit.id, { cancel: true }, tech())).rejects.toMatchObject({ status: 409 });
    expect(await status(visit.id)).toBe("IN_PROGRESS");
  });
});
