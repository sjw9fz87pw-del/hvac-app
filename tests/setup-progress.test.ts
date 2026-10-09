/**
 * The getting-started list reads what exists; nothing is ticked by hand.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { capabilitiesFor } from "@/lib/auth/permissions";
import type { Actor } from "@/lib/auth/session";
import { setupProgress } from "@/lib/api/setup-progress";

const prisma = new PrismaClient();
const stamp = Date.now();
let companyId: string, userId: string;

function owner(): Actor {
  const roles = ["SUPER_ADMIN"] as Actor["roles"];
  return {
    userId, name: "Owner", email: "o@x.example", serviceCompanyId: companyId,
    roles, capabilities: capabilitiesFor(roles), internal: true,
    organizationIds: new Set(), locationIds: null,
  };
}
const steps = async () => Object.fromEntries((await setupProgress(owner())).map((s) => [s.key, s]));

beforeAll(async () => {
  companyId = (await prisma.serviceCompany.create({ data: { name: "Setup Co", slug: `setup-${stamp}` } })).id;
  userId = (await prisma.user.create({
    data: { serviceCompanyId: companyId, email: `setup-${stamp}@x.example`, name: "Owner", passwordHash: "x" },
  })).id;
});

afterAll(async () => {
  const orgs = { organization: { serviceCompanyId: companyId } };
  await prisma.maintenanceSchedule.deleteMany({ where: { equipment: orgs } });
  await prisma.equipment.deleteMany({ where: orgs });
  await prisma.restaurantLocation.deleteMany({ where: orgs });
  await prisma.customerOrganization.deleteMany({ where: { serviceCompanyId: companyId } });
  await prisma.serviceType.deleteMany({ where: { serviceCompanyId: companyId } });
  await prisma.user.deleteMany({ where: { serviceCompanyId: companyId } });
  await prisma.serviceCompany.deleteMany({ where: { id: companyId } });
  await prisma.$disconnect();
});

describe("setup progress", () => {
  it("starts with everything to do, pointing at adding a restaurant", async () => {
    const s = await steps();
    expect(s.restaurant.done).toBe(false);
    expect(s.units.done).toBe(false);
    expect(s.tags.done).toBe(false);
    expect(s.team.done).toBe(false);
    expect(s.restaurant.href).toBe("/admin/locations/new");
  });

  it("follows what has been added", async () => {
    const org = await prisma.customerOrganization.create({
      data: { serviceCompanyId: companyId, name: "Setup Group", slug: `setup-org-${stamp}` },
    });
    const loc = await prisma.restaurantLocation.create({ data: { organizationId: org.id, name: "Setup Place" } });
    const type = await prisma.serviceType.create({
      data: { serviceCompanyId: companyId, key: `S-${stamp}`, name: "Setup job", category: "OTHER", defaultIntervalDays: 30 },
    });
    const units = await Promise.all([1, 2].map((i) => prisma.equipment.create({
      data: {
        organizationId: org.id, locationId: loc.id, name: `S Unit ${i}`, category: "OTHER",
        equipmentType: "Test", internalAssetId: `S-${i}-${stamp}`,
      },
    })));
    await prisma.maintenanceSchedule.create({
      data: { equipmentId: units[0].id, serviceTypeId: type.id, intervalDays: 30, intervalSource: "SYSTEM", nextDueAt: new Date(), status: "DUE" },
    });

    let s = await steps();
    expect(s.restaurant.done).toBe(true);
    expect(s.units.done).toBe(true);
    // One of two units has work: not done, and it says how far along.
    expect(s.work.done).toBe(false);
    expect(s.work.detail).toBe("1 of 2 units have work set");
    expect(s.units.href).toBe(`/admin/locations/${loc.id}/units/new`);

    await prisma.maintenanceSchedule.create({
      data: { equipmentId: units[1].id, serviceTypeId: type.id, intervalDays: 30, intervalSource: "SYSTEM", nextDueAt: new Date(), status: "DUE" },
    });
    // An invited colleague counts from the moment of the invitation.
    await prisma.user.create({
      data: { serviceCompanyId: companyId, email: `setup-tech-${stamp}@x.example`, name: "Tech", passwordHash: "x" },
    });
    s = await steps();
    expect(s.work.done).toBe(true);
    expect(s.team.done).toBe(true);
    expect(s.tags.detail).toBe("0 of 2 units tagged");
  });
});
