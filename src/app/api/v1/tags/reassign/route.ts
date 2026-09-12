import { NextRequest } from "next/server";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { reassignTag } from "@/lib/nfc/service";
import { ok, route } from "@/lib/api/respond";

const schema = z.object({
  tagId: z.string().min(1),
  toEquipmentId: z.string().min(1),
  reason: z.string().min(1).max(300),
});

export const POST = route(async (request: NextRequest) => {
  const actor = await requireCapability("tag.reassign");
  const input = schema.parse(await request.json());
  const tag = await reassignTag({ ...input, actor });
  return ok({ tagId: tag?.id, state: tag?.state, equipmentId: input.toEquipmentId });
});
