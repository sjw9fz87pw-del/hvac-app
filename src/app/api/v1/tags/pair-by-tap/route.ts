import { NextRequest } from "next/server";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { pairTagByTap } from "@/lib/nfc/service";
import { withIdempotency } from "@/lib/sync/idempotency";
import { ok, route } from "@/lib/api/respond";

const schema = z.object({
  /** The token as it came off the chip, not a tag id: the server re-verifies it. */
  payload: z.string().min(1),
  equipmentId: z.string().min(1),
});

/**
 * Pair a tag that was written elsewhere and then tapped.
 *
 * The iPhone route. No read-back is possible, so the tap supplies the proof
 * instead, and the signature is checked here rather than asserted by the
 * client — which is why this endpoint takes the payload and not a tag id.
 */
export const POST = route(async (request: NextRequest) => {
  const actor = await requireCapability("tag.pair");
  const body = await request.json();
  const input = schema.parse(body);

  const outcome = await withIdempotency(
    { actorId: actor.userId, key: request.headers.get("idempotency-key"), endpoint: "POST /tags/pair-by-tap", body },
    async () => {
      const { tag } = await pairTagByTap({ ...input, actor });
      return { status: 200, body: { tagId: tag.id, state: tag.state, equipmentId: input.equipmentId } };
    },
  );

  return ok(outcome.body, outcome.status);
});
