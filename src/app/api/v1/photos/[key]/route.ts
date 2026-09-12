import { NextRequest } from "next/server";
import { requireActor } from "@/lib/auth/session";
import { blobStore } from "@/lib/photos/storage";
import { fail, route } from "@/lib/api/respond";

/**
 * Photos are served through the app, never as public object-store URLs, so an
 * image cannot be shared out of a tenant by passing its link around.
 */
export const GET = route(async (_request: NextRequest, ctx: { params: Promise<{ key: string }> }) => {
  await requireActor();
  const { key } = await ctx.params;

  const blob = await blobStore().get(decodeURIComponent(key));
  if (!blob) return fail(404, "Not found");

  return new Response(new Uint8Array(blob.data), {
    headers: {
      "content-type": blob.contentType,
      "cache-control": "private, max-age=3600",
      "content-length": String(blob.data.byteLength),
    },
  });
});
