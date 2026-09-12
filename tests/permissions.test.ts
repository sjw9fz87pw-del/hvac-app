import { describe, expect, it } from "vitest";
import { roleHas, capabilitiesFor, isInternalRole, ROLE_CAPABILITIES, type Role, type Capability } from "@/lib/auth/permissions";
import { toCustomerEquipment, toCustomerServiceRecord } from "@/lib/api/serializers";
import { canAccessAsset, assertAsset } from "@/lib/auth/scope";

const CUSTOMER_ROLES: Role[] = ["CUSTOMER_ORG_OWNER", "CUSTOMER_LOCATION_MANAGER", "CUSTOMER_STAFF"];
const INTERNAL: Role[] = ["SUPER_ADMIN", "OPERATIONS_ADMIN", "SERVICE_MANAGER", "TECHNICIAN"];

describe("role capabilities", () => {
  it("classifies internal and customer roles", () => {
    for (const role of INTERNAL) expect(isInternalRole(role)).toBe(true);
    for (const role of CUSTOMER_ROLES) expect(isInternalRole(role)).toBe(false);
  });

  it("never lets a customer role write or revoke a tag", () => {
    const tagWrites: Capability[] = ["tag.mint", "tag.pair", "tag.replace", "tag.unpair", "tag.reassign", "tag.revoke"];
    for (const role of CUSTOMER_ROLES) {
      for (const capability of tagWrites) {
        expect(roleHas(role, capability), `${role} must not have ${capability}`).toBe(false);
      }
    }
  });

  it("never lets a customer role read internal technician notes", () => {
    for (const role of CUSTOMER_ROLES) expect(roleHas(role, "equipment.readInternalNotes")).toBe(false);
    for (const role of INTERNAL) expect(roleHas(role, "equipment.readInternalNotes")).toBe(true);
  });

  it("never lets a customer role verify equipment or manage schedules", () => {
    for (const role of CUSTOMER_ROLES) {
      expect(roleHas(role, "equipment.verify")).toBe(false);
      expect(roleHas(role, "schedule.manage")).toBe(false);
      expect(roleHas(role, "plan.manage")).toBe(false);
    }
  });

  it("keeps limited staff genuinely limited", () => {
    expect(roleHas("CUSTOMER_STAFF", "equipment.read")).toBe(true);
    expect(roleHas("CUSTOMER_STAFF", "issue.create")).toBe(true);
    expect(roleHas("CUSTOMER_STAFF", "equipment.create")).toBe(false);
    expect(roleHas("CUSTOMER_STAFF", "report.view")).toBe(false);
    expect(roleHas("CUSTOMER_STAFF", "report.viewCosts")).toBe(false);
  });

  it("lets a technician do the job and nothing more", () => {
    expect(roleHas("TECHNICIAN", "service.complete")).toBe(true);
    expect(roleHas("TECHNICIAN", "tag.pair")).toBe(true);
    expect(roleHas("TECHNICIAN", "tag.revoke")).toBe(false);
    expect(roleHas("TECHNICIAN", "equipment.archive")).toBe(false);
    expect(roleHas("TECHNICIAN", "settings.manage")).toBe(false);
    expect(roleHas("TECHNICIAN", "user.manage")).toBe(false);
  });

  it("reserves editing a completed service record for a super admin", () => {
    expect(roleHas("SUPER_ADMIN", "service.edit")).toBe(true);
    for (const role of ["OPERATIONS_ADMIN", "SERVICE_MANAGER", "TECHNICIAN", ...CUSTOMER_ROLES] as Role[]) {
      expect(roleHas(role, "service.edit")).toBe(false);
    }
  });

  it("reserves settings for a super admin", () => {
    const holders = (Object.keys(ROLE_CAPABILITIES) as Role[]).filter((r) => roleHas(r, "settings.manage"));
    expect(holders).toEqual(["SUPER_ADMIN"]);
  });

  it("unions capabilities across several memberships", () => {
    const caps = capabilitiesFor(["TECHNICIAN", "SERVICE_MANAGER"]);
    expect(caps.has("service.complete")).toBe(true);
    expect(caps.has("tag.revoke")).toBe(true);
  });

  it("grants nothing for an empty role list", () => {
    expect(capabilitiesFor([]).size).toBe(0);
  });
});

describe("customer serializers", () => {
  const equipment = {
    id: "eq_1", organizationId: "org_1", locationId: "loc_1", areaId: "area_1",
    name: "Back Bar Cooler #2", category: "REFRIGERATION", equipmentType: "Back bar cooler",
    manufacturer: "True", model: "TBB-24-48", serialNumber: "TBB4419044", internalAssetId: "MONA-0002",
    yearInstalled: null, status: "ACTIVE", condition: "GOOD", criticality: "STANDARD",
    filterSize: null, filterType: null, filterQuantity: null,
    warrantyProvider: null, warrantyExpires: null, warrantyNotes: null, vendorId: null,
    technicianNotes: "INTERNAL: customer is behind on payment, do not mention the compressor concern",
    customerVisibleNotes: "Cleaned and airflow verified.",
    createdById: null, createdBySource: "INTERNAL", verifiedAt: null, verifiedById: null,
    archivedAt: null, archivedReason: null, replacedByAssetId: null,
    createdAt: new Date(), updatedAt: new Date(),
    photos: [], schedules: [], tagAssignments: [],
  };

  it("never emits internal technician notes to a customer", () => {
    const view = toCustomerEquipment(equipment as never);
    expect(JSON.stringify(view)).not.toContain("INTERNAL:");
    expect(JSON.stringify(view)).not.toContain("do not mention");
    expect(view.notes).toBe("Cleaned and airflow verified.");
    expect("technicianNotes" in view).toBe(false);
  });

  it("hides data-plate close-ups, which are an internal artifact", () => {
    const view = toCustomerEquipment({
      ...equipment,
      photos: [
        { id: "p1", equipmentId: "eq_1", kind: "DATA_PLATE", blobKey: "plate", width: null, height: null, bytes: null, capturedAt: new Date(), uploadedById: null, caption: null, createdAt: new Date() },
        { id: "p2", equipmentId: "eq_1", kind: "IDENTIFICATION", blobKey: "front", width: null, height: null, bytes: null, capturedAt: new Date(), uploadedById: null, caption: null, createdAt: new Date() },
      ],
    } as never);
    expect(view.photos.map((p) => p.id)).toEqual(["p2"]);
  });

  it("never emits internal notes on a service record", () => {
    const view = toCustomerServiceRecord({
      id: "sr_1", organizationId: "org_1", locationId: "loc_1", equipmentId: "eq_1",
      serviceTypeId: "st_1", visitId: null, visitTaskId: null, technicianId: "u_1",
      performedAt: new Date(), durationMinutes: 20,
      technicianNotes: "INTERNAL: unit is on its last legs, flag for replacement quote",
      customerVisibleNotes: "Condenser cleaned.",
      issuesFoundCount: 0, nextDueAt: new Date(), nfcVerified: true, nfcTagId: null,
      verificationMethod: "NFC", checklistResults: [{ label: "Clean condenser", completed: true }],
      contentHash: "x", supersedesId: null, supersededReason: null, createdAt: new Date(),
      serviceType: { name: "Condenser cleaning" }, technician: { name: "Jordan Blake" }, photos: [],
    } as never);
    expect(JSON.stringify(view)).not.toContain("INTERNAL:");
    expect(view.notes).toBe("Condenser cleaned.");
  });
});

describe("internal roles can reach the screens they are given", () => {
  it("lets every internal role read customers and locations", () => {
    // Regression: internal roles were built from the technician list, which
    // originally omitted org.read, so the Customers and Locations pages failed
    // for staff while working for customers.
    for (const role of INTERNAL) {
      expect(roleHas(role, "org.read"), `${role} must be able to read customers`).toBe(true);
    }
  });

  it("keeps reading a customer separate from changing one", () => {
    expect(roleHas("TECHNICIAN", "org.read")).toBe(true);
    expect(roleHas("TECHNICIAN", "org.manage")).toBe(false);
    expect(roleHas("SERVICE_MANAGER", "org.manage")).toBe(false);
    expect(roleHas("OPERATIONS_ADMIN", "org.manage")).toBe(true);
  });

  it("gives every internal role the screens its navigation exposes", () => {
    const navCapabilities: Record<string, Capability> = {
      Customers: "org.read", Locations: "org.read", Equipment: "equipment.read",
      Schedule: "visit.read", Issues: "issue.read", NFC: "tag.viewHistory",
    };
    for (const [screen, capability] of Object.entries(navCapabilities)) {
      for (const role of ["SUPER_ADMIN", "OPERATIONS_ADMIN", "SERVICE_MANAGER"] as Role[]) {
        expect(roleHas(role, capability), `${role} needs ${capability} for ${screen}`).toBe(true);
      }
    }
  });
});

describe("location scope", () => {
  // Pure-function coverage of the same regression the integration suite exercises
  // against the database.
  const base = {
    name: "Test", email: "t@example.com", serviceCompanyId: "sc",
    capabilities: capabilitiesFor(["CUSTOMER_LOCATION_MANAGER"]),
    internal: false,
  };

  const manager = {
    ...base, userId: "u_mgr", roles: ["CUSTOMER_LOCATION_MANAGER"] as Role[],
    organizationIds: new Set(["org_a"]), locationIds: new Set(["loc_1"]),
  };
  const owner = {
    ...base, userId: "u_own", roles: ["CUSTOMER_ORG_OWNER"] as Role[],
    capabilities: capabilitiesFor(["CUSTOMER_ORG_OWNER"]),
    organizationIds: new Set(["org_a"]), locationIds: null,
  };
  const staff = {
    ...base, userId: "u_staff", roles: ["OPERATIONS_ADMIN"] as Role[],
    capabilities: capabilitiesFor(["OPERATIONS_ADMIN"]), internal: true,
    organizationIds: new Set<string>(), locationIds: null,
  };

  it("confines a location manager to their own location", () => {
    expect(canAccessAsset(manager, { organizationId: "org_a", locationId: "loc_1" })).toBe(true);
    expect(canAccessAsset(manager, { organizationId: "org_a", locationId: "loc_2" })).toBe(false);
    expect(canAccessAsset(manager, { organizationId: "org_b", locationId: "loc_1" })).toBe(false);
  });

  it("gives an org owner every location in their group and none outside it", () => {
    expect(canAccessAsset(owner, { organizationId: "org_a", locationId: "loc_1" })).toBe(true);
    expect(canAccessAsset(owner, { organizationId: "org_a", locationId: "loc_2" })).toBe(true);
    expect(canAccessAsset(owner, { organizationId: "org_b", locationId: "loc_9" })).toBe(false);
  });

  it("does not restrict internal staff by location", () => {
    expect(canAccessAsset(staff, { organizationId: "org_b", locationId: "loc_9" })).toBe(true);
  });

  it("throws a 404 rather than a 403 for an out-of-scope location", () => {
    try {
      assertAsset(manager, { organizationId: "org_a", locationId: "loc_2" });
      throw new Error("should have refused");
    } catch (error) {
      expect((error as { status?: number }).status).toBe(404);
    }
  });
});
