import { NextRequest } from "next/server";
import { z } from "zod";
import { parseTagUrl, denialMessage } from "@pmops/nfc-core";
import { requireCapability, requestMeta } from "@/lib/auth/session";
import { testTag } from "@/lib/nfc/service";
import { ok, route } from "@/lib/api/respond";

const schema = z.object({ payload: z.string().min(1) });

/**
 * "Test Tag" in the NFC console: read a tag and report exactly why it did or did
 * not resolve. Internal only - unlike the public resolver, this one tells staff
 * the specific reason so they can fix the tag.
 */
export const POST = route(async (request: NextRequest) => {
  const actor = await requireCapability("tag.viewHistory");
  const { payload: raw } = schema.parse(await request.json());
  const meta = await requestMeta();

  const outcome = await testTag(parseTagUrl(raw) ?? raw, { actor, ...meta });
  return ok(
    outcome.ok
      ? { ok: true, tagId: outcome.tagId, equipmentId: outcome.equipmentId }
      : { ok: false, reason: outcome.reason, message: denialMessage(outcome.reason) },
  );
});
