import { NextRequest } from "next/server";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { replaceTag } from "@/lib/nfc/service";
import { ok, route } from "@/lib/api/respond";

const schema = z.object({
  equipmentId: z.string().min(1),
  newTagId: z.string().min(1),
  reason: z.string().min(1).max(300),
  verified: z.boolean(),
});

/**
 * Replace a damaged tag: revoke the old and pair the new in one transaction, so
 * the asset is never without an identity and the old tag's history is retained.
 */
export const POST = route(async (request: NextRequest) => {
  const actor = await requireCapability("tag.replace");
  const input = schema.parse(await request.json());
  const tag = await replaceTag({ ...input, actor });
  return ok({ tagId: tag.id, state: tag.state });
});
