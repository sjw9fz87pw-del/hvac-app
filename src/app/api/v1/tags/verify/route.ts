import { NextRequest } from "next/server";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { verifyWrite, recordWriteFailure } from "@/lib/nfc/service";
import { ok, route } from "@/lib/api/respond";

const schema = z.object({
  tagId: z.string().min(1),
  /** What the reader read back off the chip after writing. */
  readBackPayload: z.string().min(1).nullish(),
  writeError: z.string().max(500).nullish(),
});

/** Step 2 of pairing: prove the chip actually carries what we meant to write. */
export const POST = route(async (request: NextRequest) => {
  const actor = await requireCapability("tag.pair");
  const input = schema.parse(await request.json());

  if (input.writeError || !input.readBackPayload) {
    await recordWriteFailure(input.tagId, input.writeError ?? "No payload read back", actor);
    return ok({ verified: false, reason: input.writeError ?? "Nothing was read back from the tag" });
  }

  const result = await verifyWrite(input.tagId, input.readBackPayload, actor);
  return ok(result);
});
