import { NextRequest } from "next/server";
import { requireActor } from "@/lib/auth/session";
import { assertOrganization, assertLocation } from "@/lib/auth/scope";
import { customerDashboard, commandCenter } from "@/lib/api/dashboards";
import { ok, route } from "@/lib/api/respond";

export const GET = route(async (request: NextRequest) => {
  const actor = await requireActor();
  const params = request.nextUrl.searchParams;

  if (params.get("view") === "command-center" && actor.internal) {
    return ok(await commandCenter(actor));
  }

  const organizationId = params.get("organizationId");
  const locationId = params.get("locationId");
  if (organizationId) assertOrganization(actor, organizationId);
  if (locationId) assertLocation(actor, locationId);

  return ok(await customerDashboard(actor, { organizationId, locationId }));
});
