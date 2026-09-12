import { NextRequest } from "next/server";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { pairTag } from "@/lib/nfc/service";
import { withIdempotency } from "@/lib/sync/idempotency";
import { ok, route } from "@/lib/api/respond";

const schema = z.object({
  tagId: z.string().min(1),
  equipmentId: z.string().min(1),
  verified: z.boolean(),
});

/** Step 3: commit the pairing. Refused unless the write was verified. */
export const POST = route(async (request: NextRequest) => {
  const actor = await requireCapability("tag.pair");
  const body = await request.json();
  const input = schema.parse(body);

  const outcome = await withIdempotency(
    { actorId: actor.userId, key: request.headers.get("idempotency-key"), endpoint: "POST /tags/pair", body },
    async () => {
      const { tag } = await pairTag({ ...input, actor });
      return { status: 200, body: { tagId: tag.id, state: tag.state, equipmentId: input.equipmentId } };
    },
  );

  return ok(outcome.body, outcome.status);
});
