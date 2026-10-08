import { NextRequest } from "next/server";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { createJob } from "@/lib/api/jobs";
import { ok, route } from "@/lib/api/respond";

const schema = z.object({
  name: z.string().trim().min(2, "Give the job a name").max(60, "Keep the name under 60 characters"),
  intervalDays: z.number().int().min(1).max(3650),
});

/** Define a new kind of job, company-wide. It produces work once added to units. */
export const POST = route(async (request: NextRequest) => {
  const actor = await requireCapability("settings.manage");
  const input = schema.parse(await request.json());
  const job = await createJob({
    serviceCompanyId: actor.serviceCompanyId,
    name: input.name,
    intervalDays: input.intervalDays,
    actorId: actor.userId,
  });
  return ok({ id: job.id, name: job.name, defaultIntervalDays: job.defaultIntervalDays }, 201);
});
