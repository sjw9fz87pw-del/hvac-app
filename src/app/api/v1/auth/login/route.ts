import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, SESSION_COOKIE, sessionCookieOptions, requestMeta } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit/log";
import { ok, fail, route } from "@/lib/api/respond";

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

export const POST = route(async (request: NextRequest) => {
  const { email, password } = schema.parse(await request.json());
  const meta = await requestMeta();

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

  // Same message and roughly the same work either way, so this endpoint cannot
  // be used to discover which email addresses exist.
  const valid = user?.active ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !valid) {
    if (user) {
      await recordAudit({ action: "auth.login_failed", entityType: "User", entityId: user.id, ...meta });
    }
    return fail(401, "Email or password is incorrect");
  }

  const { token, expiresAt } = await createSession(user.id, meta);
  await recordAudit({ action: "auth.login", entityType: "User", entityId: user.id, actorId: user.id, ...meta });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));

  return ok({ user: { id: user.id, name: user.name, email: user.email } });
});
