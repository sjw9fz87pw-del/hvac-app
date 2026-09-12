import { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { refreshScheduleStatuses } from "@/lib/maintenance/scheduling";
import { notifyOverdueDigest } from "@/lib/notifications/notify";
import { ok, fail, route } from "@/lib/api/respond";

/**
 * The nightly job.
 *
 * Schedule statuses are stored, not computed on read, so that dashboards and
 * work queues stay fast. Something therefore has to walk the clock forward:
 * without this, an asset that became overdue at midnight would keep reporting
 * DUE until someone happened to touch it.
 *
 * Both operations are idempotent, so a missed run or a double run is harmless.
 * Authenticated by a shared token rather than a session, because the caller is
 * a scheduled function with no user behind it.
 */
function authorized(request: NextRequest): boolean {
  const expected = process.env.JOB_TOKEN;
  if (!expected) return false;
  const provided = request.headers.get("x-job-token") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const POST = route(async (request: NextRequest) => {
  if (!authorized(request)) return fail(401, "Unauthorized");

  const started = Date.now();
  const statusesChanged = await refreshScheduleStatuses();
  const notificationsSent = await notifyOverdueDigest();

  return ok({
    statusesChanged,
    notificationsSent,
    durationMs: Date.now() - started,
    ranAt: new Date().toISOString(),
  });
});
