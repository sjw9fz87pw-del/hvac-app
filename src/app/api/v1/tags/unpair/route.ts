import { NextRequest } from "next/server";
import { z } from "zod";
import { requireActor, assertCapability } from "@/lib/auth/session";
import { unpairTag } from "@/lib/nfc/service";
import { ok, route } from "@/lib/api/respond";

const schema = z.object({
  equipmentId: z.string().min(1),
  reason: z.string().max(300).optional(),
  /** Revoking is a stronger action and needs the revoke capability. */
  revoke: z.boolean().default(false),
});

export const POST = route(async (request: NextRequest) => {
  const actor = await requireActor();
  const input = schema.parse(await request.json());
  assertCapability(actor, input.revoke ? "tag.revoke" : "tag.unpair");

  const tag = await unpairTag({ equipmentId: input.equipmentId, actor, reason: input.reason, revoke: input.revoke });
  return ok({ tagId: tag.id, state: tag.state });
});
