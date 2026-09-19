import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { hashPassword } from "@/lib/auth/password";
import { verifyInviteToken, peekUserId } from "@/lib/auth/invite";
import { createSession, SESSION_COOKIE, sessionCookieOptions, requestMeta } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit/log";
import { ok, fail, route } from "@/lib/api/respond";

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(10).max(200),
});

/**
 * Accept an invitation or reset link by choosing a password.
 *
 * Public by necessity — the person has no account to authenticate with yet. The
 * token is the credential, and it is verified against the user's current
 * password hash, so setting a password consumes every link issued before it.
 *
 * Failures are deliberately uniform: expired, forged and already-used links all
 * say the same thing, because distinguishing them would reveal which addresses
 * have invitations outstanding.
 */
export const POST = route(async (request: NextRequest) => {
  const input = schema.parse(await request.json());

  const userId = peekUserId(input.token);
  const user = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null;

  // Verify against a decoy when there is no such user, so a missing account and
  // a bad signature take the same path rather than differing by timing.
  const result = verifyInviteToken(input.token, user?.passwordHash ?? "no-such-user");
  if (!user || !result.ok || !user.active) {
    return fail(400, "This link is no longer valid. Ask for a new one.");
  }

  const passwordHash = await hashPassword(input.password);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
    // Every other outstanding link died the moment the hash changed. End live
    // sessions too, so a reset actually locks out whoever was signed in.
    await tx.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await recordAudit(
      { action: "user.password_set", entityType: "User", entityId: user.id, actorId: user.id },
      tx,
    );
  });

  // Sign them straight in: they proved control of the link and just chose the
  // password, so a login form here would be friction with no security value.
  const meta = await requestMeta();
  const { token, expiresAt } = await createSession(user.id, meta);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));

  return ok({ id: user.id, email: user.email, name: user.name });
});
