import { z } from "zod";

export const equipmentCategory = z.enum([
  "REFRIGERATION", "HVAC", "ICE_MACHINE", "WATER_FILTRATION",
  "COOKING", "WAREWASHING", "BEVERAGE", "OTHER",
]);

export const criticality = z.enum(["CRITICAL", "HIGH", "STANDARD", "LOW"]);
export const condition = z.enum(["EXCELLENT", "GOOD", "FAIR", "POOR", "UNKNOWN"]);

export const createEquipmentSchema = z.object({
  locationId: z.string().min(1),
  areaId: z.string().min(1).nullish(),
  /** Lets Rapid Inventory create an area and the asset in one round trip. */
  newAreaName: z.string().min(1).max(80).nullish(),
  name: z.string().min(1).max(120),
  category: equipmentCategory,
  equipmentType: z.string().min(1).max(80),
  manufacturer: z.string().max(80).nullish(),
  model: z.string().max(80).nullish(),
  serialNumber: z.string().max(80).nullish(),
  yearInstalled: z.number().int().min(1950).max(2100).nullish(),
  criticality: criticality.default("STANDARD"),
  condition: condition.default("UNKNOWN"),
  filterSize: z.string().max(40).nullish(),
  filterType: z.string().max(40).nullish(),
  filterQuantity: z.number().int().min(0).max(100).nullish(),
  warrantyProvider: z.string().max(80).nullish(),
  warrantyExpires: z.string().datetime().nullish(),
  technicianNotes: z.string().max(4000).nullish(),
  customerVisibleNotes: z.string().max(4000).nullish(),
  /** Service types plus optional per-asset interval overrides. */
  maintenance: z.array(z.object({
    serviceTypeId: z.string().min(1),
    intervalDays: z.number().int().min(1).max(3650).nullish(),
  })).default([]),
  photoBlobKeys: z.array(z.string().min(1)).max(10).default([]),
});

export const completeServiceSchema = z.object({
  visitTaskId: z.string().nullish(),
  equipmentId: z.string().min(1),
  serviceTypeId: z.string().min(1),
  performedAt: z.string().datetime(),
  durationMinutes: z.number().int().min(0).max(1440).nullish(),
  technicianNotes: z.string().max(4000).nullish(),
  customerVisibleNotes: z.string().max(4000).nullish(),
  verificationMethod: z.enum(["NFC", "QR", "MANUAL"]).nullish(),
  nfcTagId: z.string().nullish(),
  checklist: z.array(z.object({
    templateId: z.string().nullish(),
    label: z.string().min(1),
    completed: z.boolean(),
    value: z.string().nullish(),
    note: z.string().max(1000).nullish(),
  })).default([]),
  photos: z.array(z.object({
    kind: z.enum(["BEFORE", "AFTER", "ISSUE"]),
    blobKey: z.string().min(1),
    capturedAt: z.string().datetime(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    bytes: z.number().int().positive().optional(),
  })).default([]),
  issues: z.array(z.object({
    category: z.string().min(1),
    title: z.string().min(1).max(160),
    description: z.string().max(2000).nullish(),
    severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).optional(),
  })).default([]),
});

export const reportIssueSchema = z.object({
  equipmentId: z.string().min(1),
  category: z.enum([
    "NOT_COOLING", "MAKING_NOISE", "LEAKING", "DOOR_PROBLEM",
    "ICE_BUILDUP", "NEEDS_CLEANING", "OTHER",
  ]),
  description: z.string().max(2000).nullish(),
  severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).default("MEDIUM"),
  photoBlobKeys: z.array(z.string()).max(5).default([]),
});

export const ISSUE_CATEGORY_LABELS: Record<string, string> = {
  NOT_COOLING: "Not cooling",
  MAKING_NOISE: "Making noise",
  LEAKING: "Leaking",
  DOOR_PROBLEM: "Door problem",
  ICE_BUILDUP: "Ice build-up",
  NEEDS_CLEANING: "Needs cleaning",
  OTHER: "Other",
};
