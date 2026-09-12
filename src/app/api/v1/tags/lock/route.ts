import { NextRequest } from "next/server";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { recordTagLock } from "@/lib/nfc/service";
import { ok, route } from "@/lib/api/respond";

const schema = z.object({
  tagId: z.string().min(1),
  locked: z.boolean(),
  reason: z.string().max(300).nullish(),
  unsupported: z.boolean().optional(),
});

/**
 * Step 4, and the last one: record that the chip was made read-only.
 *
 * The lock itself happens on the device — this only remembers it. Reported
 * either way, because "we tried and could not" is what lets unlocked tags be
 * found later, and silence would just look like a tag nobody got to yet.
 */
export const POST = route(async (request: NextRequest) => {
  const actor = await requireCapability("tag.pair");
  const input = schema.parse(await request.json());
  const tag = await recordTagLock({ ...input, actor });
  return ok({ tagId: tag.id, lockedAt: tag.lockedAt?.toISOString() ?? null });
});
