import { NextRequest } from "next/server";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { attachJob } from "@/lib/api/jobs";
import { ok, route } from "@/lib/api/respond";

const schema = z.object({
  equipmentIds: z.array(z.string().min(1)).min(1).max(500),
  serviceTypeId: z.string().min(1),
  /** Null follows whatever applies to each unit already; a number sets it on each unit. */
  intervalDays: z.number().int().min(1).max(3650).nullable().default(null),
});

/** Put a job on one or more units. Units that already have it are left as they are. */
export const POST = route(async (request: NextRequest) => {
  const actor = await requireCapability("schedule.manage");
  const input = schema.parse(await request.json());
  const result = await attachJob({ ...input, actor });
  return ok(result);
});
