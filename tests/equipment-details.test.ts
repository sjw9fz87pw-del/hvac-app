/**
 * Correcting a unit's details after it is set up: make, model and serial were
 * only settable at creation, before anyone had read the plate on the back.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { capabilitiesFor } from "@/lib/auth/permissions";
import type { Actor } from "@/lib/auth/session";
import { updateEquipmentDetails } from "@/lib/api/equipment";

const prisma = new PrismaClient();
const stamp = Date.now();
let companyId: string, orgId: string, locId: string, otherLocId: string, userId: string;
let kitchenId: string, barId: string, foreignAreaId: string, unitId: string;

function owner(): Actor {
  const roles = ["SUPER_ADMIN"] as Actor["roles"];
  return {
    userId, name: "Owner", email: "o@x.example", serviceCompanyId: companyId,
    roles, capabilities: capabilitiesFor(roles), internal: true, organizationIds: new Set([orgId]), locationIds: null,
  };
}

beforeAll(async () => {
  companyId = (await prisma.serviceCompany.create({ data: { name: "Details Co", slug: `details-${stamp}` } })).id;
  userId = (await prisma.user.create({
    data: { serviceCompanyId: companyId, email: `details-${stamp}@x.example`, name: "Owner", passwordHash: "x" },
  })).id;
  orgId = (await prisma.customerOrganization.create({
    data: { serviceCompanyId: companyId, name: "Details Org", slug: `details-org-${stamp}` },
  })).id;
  locId = (await prisma.restaurantLocation.create({ data: { organizationId: orgId, name: "Details Place" } })).id;
  otherLocId = (await prisma.restaurantLocation.create({ data: { organizationId: orgId, name: "Elsewhere" } })).id;
  kitchenId = (await prisma.area.create({ data: { locationId: locId, name: "Kitchen", sortOrder: 0 } })).id;
  barId = (await prisma.area.create({ data: { locationId: locId, name: "Bar", sortOrder: 1 } })).id;
  foreignAreaId = (await prisma.area.create({ data: { locationId: otherLocId, name: "Patio", sortOrder: 0 } })).id;
  unitId = (await prisma.equipment.create({
    data: {
      organizationId: orgId, locationId: locId, areaId: kitchenId, name: "Kitchen Refrigerator 4",
      category: "REFRIGERATION", equipmentType: "Refrigerator", internalAssetId: `D-1-${stamp}`,
    },
  })).id;
});

afterAll(async () => {
  await prisma.auditEvent.deleteMany({ where: { actorId: userId } });
  await prisma.equipment.deleteMany({ where: { organizationId: orgId } });
  await prisma.area.deleteMany({ where: { location: { organizationId: orgId } } });
  await prisma.restaurantLocation.deleteMany({ where: { organizationId: orgId } });
  await prisma.customerOrganization.deleteMany({ where: { id: orgId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.serviceCompany.deleteMany({ where: { id: companyId } });
  await prisma.$disconnect();
});

describe("editing a unit's details", () => {
  it("saves what changed, and records what it was before", async () => {
    await updateEquipmentDetails(unitId, {
      name: "  Kitchen Refrigerator 4 ", manufacturer: " True ", model: "T-49", serialNumber: "X9-2214", areaId: barId,
    }, owner());
    const unit = await prisma.equipment.findUniqueOrThrow({ where: { id: unitId } });
    expect(unit).toMatchObject({ manufacturer: "True", model: "T-49", serialNumber: "X9-2214", areaId: barId });

    const audit = await prisma.auditEvent.findFirstOrThrow({ where: { entityId: unitId, action: "asset.updated" } });
    // The unchanged name is not in the record; the area is, with its old value.
    expect(audit.after).toEqual({ manufacturer: "True", model: "T-49", serialNumber: "X9-2214", areaId: barId });
    expect(audit.before).toMatchObject({ manufacturer: null, areaId: kitchenId });
  });

  it("clears a field left blank, rather than storing an empty string", async () => {
    await updateEquipmentDetails(unitId, { model: "   ", areaId: null }, owner());
    const unit = await prisma.equipment.findUniqueOrThrow({ where: { id: unitId } });
    expect(unit.model).toBeNull();
    expect(unit.areaId).toBeNull();
  });

  it("refuses an area from another restaurant, and a blank name", async () => {
    await expect(updateEquipmentDetails(unitId, { areaId: foreignAreaId }, owner())).rejects.toMatchObject({ status: 422 });
    await expect(updateEquipmentDetails(unitId, { name: "  " }, owner())).rejects.toMatchObject({ status: 422 });
  });

  it("treats a unit outside your reach as not found", async () => {
    // Someone on the restaurant side of a different group.
    const roles = ["CUSTOMER_ORG_OWNER"] as Actor["roles"];
    const outsider: Actor = {
      userId, name: "Other", email: "x@x.example", serviceCompanyId: companyId,
      roles, capabilities: capabilitiesFor(roles), internal: false,
      organizationIds: new Set(["another-group"]), locationIds: null,
    };
    await expect(updateEquipmentDetails(unitId, { model: "X" }, outsider)).rejects.toMatchObject({ status: 404 });
  });
});
