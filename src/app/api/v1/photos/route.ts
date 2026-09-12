import { NextRequest } from "next/server";
import { requireActor } from "@/lib/auth/session";
import { blobStore } from "@/lib/photos/storage";
import { ok, fail, route } from "@/lib/api/respond";

/**
 * Photo upload.
 *
 * Compression happens on the client before the bytes ever leave the phone -
 * a 4MB camera capture becomes roughly 200KB, which is what makes uploads
 * survive a basement connection. The server validates type and size and
 * generates the storage key itself; a key supplied by a client is never trusted.
 */
export const POST = route(async (request: NextRequest) => {
  const actor = await requireActor();
  const form = await request.formData();
  const file = form.get("file");
  const prefix = String(form.get("prefix") ?? "equipment");

  if (!(file instanceof File)) return fail(422, "A file is required");
  if (file.size === 0) return fail(422, "The file is empty");

  const stored = await blobStore().put(Buffer.from(await file.arrayBuffer()), {
    contentType: file.type || "image/jpeg",
    prefix,
  });

  return ok(
    {
      blobKey: stored.key,
      bytes: stored.bytes,
      sha256: stored.sha256,
      uploadedBy: actor.userId,
      capturedAt: (form.get("capturedAt") as string) ?? new Date().toISOString(),
    },
    201,
  );
});
