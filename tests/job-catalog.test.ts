/**
 * Adding and removing jobs, and putting them on units.
 *
 * The properties that matter: a job with history is never deleted out from
 * under its records; a job added to an old unit is due now, not overdue since
 * the unit was created; one tenant can never reach another's units; and
 * removing work leaves no task, plan or empty visit behind.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { capabilitiesFor } from "@/lib/auth/permissions";
import type { Actor } from "@/lib/auth/session";
import { createJob, removeJob, attachJob, detachJob, jobKey, JobError } from "@/lib/api/jobs";
import { setIntervalOverride } from "@/lib/maintenance/planning";

const prisma = new PrismaClient();
const stamp = Date.now();

let companyId: string, orgA: string, orgB: string, locA: string, userId: string;
let unitA1: string, unitA2: string, unitB: string;

function owner(organizationIds: string[] = [orgA]): Actor {
  const roles = ["SUPER_ADMIN"] as Actor["roles"];
  return {
    userId, name: "Owner", email: "o@x.example", serviceCompanyId: companyId,
    roles, capabilities: capabilitiesFor(roles), internal: true,
    organizationIds: new Set(organizationIds), locationIds: null,
  };
}

/** A tenant-bound customer, who must never reach another tenant's unit. */
function customerOf(org: string): Actor {
  const roles = ["CUSTOMER_ORG_OWNER"] as Actor["roles"];
  return {
    userId, name: "Customer", email: "c@x.example", serviceCompanyId: companyId,
    roles, capabilities: capabilitiesFor(roles), internal: false,
    organizationIds: new Set([org]), locationIds: null,
  };
}

beforeAll(async () => {
  const company = await prisma.serviceCompany.create({ data: { name: "Jobs Co", slug: `jobs-${stamp}` } });
  companyId = company.id;
  userId = (await prisma.user.create({
    data: { serviceCompanyId: companyId, email: `jobs-${stamp}@x.example`, name: "Owner", passwordHash: "x" },
  })).id;

  const makeOrg = async (name: string) => {
    const org = await prisma.customerOrganization.create({
      data: { serviceCompanyId: companyId, name, slug: `${name.toLowerCase()}-${stamp}` },
    });
    const loc = await prisma.restaurantLocation.create({ data: { organizationId: org.id, name: `${name} Place` } });
    return { org: org.id, loc: loc.id };
  };
  const a = await makeOrg("Ayes");
  const b = await makeOrg("Bees");
  orgA = a.org; orgB = b.org; locA = a.loc;

  // Created long ago: the case where "due since the unit was created" goes wrong.
  const longAgo = new Date(Date.now() - 120 * 86_400_000);
  const unit = (org: string, loc: string, n: string) => prisma.equipment.create({
    data: {
      organizationId: org, locationId: loc, name: `Unit ${n}`, category: "REFRIGERATION",
      equipmentType: "Reach-in", internalAssetId: `J-${n}-${stamp}`, createdAt: longAgo,
    },
  });
  unitA1 = (await unit(orgA, locA, "A1")).id;
  unitA2 = (await unit(orgA, locA, "A2")).id;
  unitB = (await unit(orgB, b.loc, "B")).id;
});

afterAll(async () => {
  const orgs = [orgA, orgB];
  await prisma.visitTask.deleteMany({ where: { equipment: { organizationId: { in: orgs } } } });
  await prisma.serviceRecord.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.visit.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.maintenanceSchedule.deleteMany({ where: { equipment: { organizationId: { in: orgs } } } });
  await prisma.maintenancePlan.deleteMany({ where: { serviceType: { serviceCompanyId: companyId } } });
  await prisma.checklistItemTemplate.deleteMany({ where: { serviceType: { serviceCompanyId: companyId } } });
  await prisma.serviceType.deleteMany({ where: { serviceCompanyId: companyId } });
  await prisma.auditEvent.deleteMany({ where: { actorId: userId } });
  await prisma.equipment.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.restaurantLocation.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.customerOrganization.deleteMany({ where: { id: { in: orgs } } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.serviceCompany.deleteMany({ where: { id: companyId } });
  await prisma.$disconnect();
});

describe("defining jobs", () => {
  it("makes a job that can actually be completed", async () => {
    const job = await createJob({ serviceCompanyId: companyId, name: "  Hood   filter ", intervalDays: 90, actorId: userId });
    const stored = await prisma.serviceType.findUniqueOrThrow({ where: { id: job.id }, include: { checklistItems: true } });

    expect(stored.name).toBe("Hood filter");
    expect(stored.defaultIntervalDays).toBe(90);
    // A required checklist with no items could never be satisfied.
    expect(stored.requiresChecklist).toBe(true);
    expect(stored.checklistItems.map((i) => i.label)).toEqual(["Hood filter"]);
    expect(stored.requiresBeforePhoto || stored.requiresAfterPhoto || stored.requiresNfcVerification).toBe(false);
  });

  it("refuses a second job with the same name, in any case", async () => {
    await expect(createJob({ serviceCompanyId: companyId, name: "HOOD FILTER", intervalDays: 30, actorId: userId }))
      .rejects.toBeInstanceOf(JobError);
  });

  it("gives a job named like a removed one its own key", async () => {
    const first = await createJob({ serviceCompanyId: companyId, name: "Grease trap", intervalDays: 30, actorId: userId });
    await prisma.serviceType.update({ where: { id: first.id }, data: { active: false } });
    const second = await createJob({ serviceCompanyId: companyId, name: "Grease trap", intervalDays: 30, actorId: userId });
    expect(first.key).toBe("GREASE_TRAP");
    expect(second.key).toBe("GREASE_TRAP_2");
  });

  it("turns any name into a safe key", () => {
    expect(jobKey("Hood filter (fryer) — 2nd")).toBe("HOOD_FILTER_FRYER_2ND");
    expect(jobKey("!!!")).toBe("JOB");
  });
});

describe("putting jobs on units", () => {
  it("makes a job added to an old unit due now, and keeps it so when the interval changes", async () => {
    const job = await createJob({ serviceCompanyId: companyId, name: "Drain line flush", intervalDays: 60, actorId: userId });
    const result = await attachJob({ equipmentIds: [unitA1, unitA2], serviceTypeId: job.id, intervalDays: null, actor: owner() });
    expect(result).toEqual({ added: 2, alreadyHad: 0 });

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const before = await prisma.maintenanceSchedule.findFirstOrThrow({ where: { equipmentId: unitA1, serviceTypeId: job.id } });
    expect(before.status).not.toBe("OVERDUE");

    // Any recompute must count from when the job was added, not from when
    // the unit was created 120 days ago.
    await setIntervalOverride({ scope: "LOCATION", serviceTypeId: job.id, locationId: locA }, 30, { userId });
    const after = await prisma.maintenanceSchedule.findFirstOrThrow({ where: { equipmentId: unitA1, serviceTypeId: job.id } });
    expect(after.intervalDays).toBe(30);
    expect(after.nextDueAt.getTime()).toBeGreaterThanOrEqual(today.getTime());
    expect(after.status).not.toBe("OVERDUE");
  });

  it("leaves units that already have the job untouched", async () => {
    const job = await prisma.serviceType.findFirstOrThrow({ where: { serviceCompanyId: companyId, name: "Drain line flush" } });
    const result = await attachJob({ equipmentIds: [unitA1], serviceTypeId: job.id, intervalDays: 7, actor: owner() });
    expect(result).toEqual({ added: 0, alreadyHad: 1 });
    // No unit override was created by the refused re-add.
    expect(await prisma.maintenancePlan.count({ where: { scope: "ASSET", equipmentId: unitA1, serviceTypeId: job.id } })).toBe(0);
  });

  it("sets a unit's own interval when one is chosen", async () => {
    const job = await createJob({ serviceCompanyId: companyId, name: "Gasket check", intervalDays: 90, actorId: userId });
    await attachJob({ equipmentIds: [unitA1], serviceTypeId: job.id, intervalDays: 14, actor: owner() });
    const schedule = await prisma.maintenanceSchedule.findFirstOrThrow({ where: { equipmentId: unitA1, serviceTypeId: job.id } });
    expect(schedule.intervalDays).toBe(14);
    expect(schedule.intervalSource).toBe("ASSET");
  });

  it("will not reach another tenant's unit, and changes nothing when refused", async () => {
    const job = await prisma.serviceType.findFirstOrThrow({ where: { serviceCompanyId: companyId, name: "Gasket check" } });
    await expect(
      attachJob({ equipmentIds: [unitA2, unitB], serviceTypeId: job.id, intervalDays: null, actor: customerOf(orgA) }),
    ).rejects.toMatchObject({ status: 404 });
    // All-or-nothing: unit A2 was in reach but the request failed as a whole.
    expect(await prisma.maintenanceSchedule.count({ where: { serviceTypeId: job.id, equipmentId: { in: [unitA2, unitB] } } })).toBe(0);
  });
});

describe("removing jobs", () => {
  it("deletes a job nobody has done, with its schedules, plans and empty visits", async () => {
    const job = await createJob({ serviceCompanyId: companyId, name: "Ice bin sanitise", intervalDays: 30, actorId: userId });
    await attachJob({ equipmentIds: [unitA1], serviceTypeId: job.id, intervalDays: null, actor: owner() });
    const schedule = await prisma.maintenanceSchedule.findFirstOrThrow({ where: { serviceTypeId: job.id } });
    const visit = await prisma.visit.create({
      data: {
        organizationId: orgA, locationId: locA, scheduledFor: new Date(), status: "SCHEDULED",
        tasks: { create: [{ equipmentId: unitA1, serviceTypeId: job.id, scheduleId: schedule.id }] },
      },
    });

    const result = await removeJob(job.id, { userId, serviceCompanyId: companyId });
    expect(result.outcome).toBe("deleted");
    expect(await prisma.serviceType.findUnique({ where: { id: job.id } })).toBeNull();
    expect(await prisma.maintenanceSchedule.count({ where: { serviceTypeId: job.id } })).toBe(0);
    // The visit existed only for this job; it would have sent someone to do nothing.
    expect(await prisma.visit.findUnique({ where: { id: visit.id } })).toBeNull();
  });

  it("retires a job that has history instead of deleting it", async () => {
    const job = await createJob({ serviceCompanyId: companyId, name: "Coil degrease", intervalDays: 30, actorId: userId });
    await attachJob({ equipmentIds: [unitA2], serviceTypeId: job.id, intervalDays: null, actor: owner() });
    await prisma.serviceRecord.create({
      data: {
        organizationId: orgA, locationId: locA, equipmentId: unitA2, serviceTypeId: job.id,
        technicianId: userId, performedAt: new Date(), contentHash: `h-${stamp}`,
      },
    });

    const result = await removeJob(job.id, { userId, serviceCompanyId: companyId });
    expect(result.outcome).toBe("retired");

    const stored = await prisma.serviceType.findUniqueOrThrow({ where: { id: job.id } });
    expect(stored.active).toBe(false);
    const schedule = await prisma.maintenanceSchedule.findFirstOrThrow({ where: { serviceTypeId: job.id } });
    expect(schedule.paused).toBe(true);
    // And the record still names it.
    expect(await prisma.serviceRecord.count({ where: { serviceTypeId: job.id } })).toBe(1);
  });

  it("will not remove another company's job", async () => {
    const job = await createJob({ serviceCompanyId: companyId, name: "Not yours", intervalDays: 30, actorId: userId });
    await expect(removeJob(job.id, { userId, serviceCompanyId: "some-other-company" }))
      .rejects.toMatchObject({ status: 404 });
    expect(await prisma.serviceType.findUnique({ where: { id: job.id } })).not.toBeNull();
  });
});

describe("taking a job off one unit", () => {
  it("removes it when it has never been done there, and its unit interval with it", async () => {
    const job = await prisma.serviceType.findFirstOrThrow({ where: { serviceCompanyId: companyId, name: "Gasket check" } });
    const schedule = await prisma.maintenanceSchedule.findFirstOrThrow({ where: { equipmentId: unitA1, serviceTypeId: job.id } });

    await detachJob(schedule.id, owner());
    expect(await prisma.maintenanceSchedule.findUnique({ where: { id: schedule.id } })).toBeNull();
    expect(await prisma.maintenancePlan.count({ where: { scope: "ASSET", equipmentId: unitA1, serviceTypeId: job.id } })).toBe(0);
  });

  it("refuses once it has been done there", async () => {
    const job = await prisma.serviceType.findFirstOrThrow({ where: { serviceCompanyId: companyId, name: "Coil degrease" } });
    const schedule = await prisma.maintenanceSchedule.findFirstOrThrow({ where: { equipmentId: unitA2, serviceTypeId: job.id } });
    await expect(detachJob(schedule.id, owner())).rejects.toMatchObject({ status: 409 });
    expect(await prisma.maintenanceSchedule.findUnique({ where: { id: schedule.id } })).not.toBeNull();
  });
});
