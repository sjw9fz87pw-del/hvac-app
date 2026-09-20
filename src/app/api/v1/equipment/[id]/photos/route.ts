import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireCapability } from "@/lib/auth/session";
import { canAccessAsset } from "@/lib/auth/scope";
import { recordAudit } from "@/lib/audit/log";
import { ok, fail, route } from "@/lib/api/respond";

const schema = z.object({
  blobKey: z.string().min(1),
  kind: z.enum(["IDENTIFICATION", "BEFORE", "AFTER", "ISSUE"]).default("IDENTIFICATION"),
  capturedAt: z.string().optional(),
  bytes: z.number().int().positive().optional(),
  caption: z.string().max(200).optional(),
});

/**
 * Attach an already-uploaded photo to a unit.
 *
 * Upload and attach are separate steps on purpose: the bytes go up first over
 * a connection that may well drop, and only a key that survived that is bound
 * to the asset. A half-finished upload therefore leaves no dangling row.
 */
export const POST = route(async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const actor = await requireCapability("equipment.update");
  const { id } = await context.params;
  const input = schema.parse(await request.json());

  const equipment = await prisma.equipment.findUnique({
    where: { id },
    select: { id: true, organizationId: true, locationId: true, name: true },
  });
  if (!equipment || !canAccessAsset(actor, equipment)) return fail(404, "Not found");

  const photo = await prisma.equipmentPhoto.create({
    data: {
      equipmentId: equipment.id,
      blobKey: input.blobKey,
      kind: input.kind,
      bytes: input.bytes ?? null,
      caption: input.caption ?? null,
      uploadedById: actor.userId,
      ...(input.capturedAt && !Number.isNaN(Date.parse(input.capturedAt))
        ? { capturedAt: new Date(input.capturedAt) }
        : {}),
    },
    select: { id: true, blobKey: true, kind: true, capturedAt: true },
  });

  await recordAudit({
    action: "asset.updated", entityType: "Equipment", entityId: equipment.id,
    actorId: actor.userId, organizationId: equipment.organizationId,
    after: { photoAdded: photo.id, kind: photo.kind },
  });

  return ok(photo, 201);
});

/** Remove a photo from a unit — a blurry one, or the wrong asset entirely. */
export const DELETE = route(async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const actor = await requireCapability("equipment.update");
  const { id } = await context.params;
  const photoId = request.nextUrl.searchParams.get("photoId");
  if (!photoId) return fail(422, "photoId is required");

  const equipment = await prisma.equipment.findUnique({
    where: { id },
    select: { id: true, organizationId: true, locationId: true },
  });
  if (!equipment || !canAccessAsset(actor, equipment)) return fail(404, "Not found");

  const photo = await prisma.equipmentPhoto.findFirst({
    where: { id: photoId, equipmentId: equipment.id }, select: { id: true },
  });
  if (!photo) return fail(404, "Not found");

  await prisma.equipmentPhoto.delete({ where: { id: photo.id } });
  await recordAudit({
    action: "asset.updated", entityType: "Equipment", entityId: equipment.id,
    actorId: actor.userId, organizationId: equipment.organizationId,
    after: { photoRemoved: photo.id },
  });

  return ok({ id: photo.id, deleted: true });
});
