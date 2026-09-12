import { NextRequest } from "next/server";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { assertOrganization } from "@/lib/auth/scope";
import { mintTag } from "@/lib/nfc/service";
import { ok, route } from "@/lib/api/respond";

const schema = z.object({ organizationId: z.string().min(1), label: z.string().max(60).nullish() });

/**
 * Step 1 of pairing: mint an identifier for a blank tag.
 * The returned payload is what the client writes to the chip. The tag is not
 * usable until the write is verified and the tag paired.
 */
export const POST = route(async (request: NextRequest) => {
  const actor = await requireCapability("tag.mint");
  const input = schema.parse(await request.json());
  assertOrganization(actor, input.organizationId);

  const { tag, payload, url } = await mintTag({ organizationId: input.organizationId, label: input.label, actor });
  return ok({ tagId: tag.id, tokenId: tag.tokenId, payload, url }, 201);
});
