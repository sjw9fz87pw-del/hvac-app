import { cookies } from "next/headers";
import { revokeSession, SESSION_COOKIE, currentActor } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit/log";
import { ok, route } from "@/lib/api/respond";

export const POST = route(async () => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const actor = await currentActor();
  if (token) await revokeSession(token);
  if (actor) {
    await recordAudit({ action: "auth.logout", entityType: "User", entityId: actor.userId, actorId: actor.userId });
  }
  store.delete(SESSION_COOKIE);
  return ok({ ok: true });
});
