import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireActor, requestMeta } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { recordAudit } from "@/lib/audit/log";
import { ok, fail, route } from "@/lib/api/respond";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12, "Use at least 12 characters").max(200),
});

/**
 * Change your own password.
 *
 * Requires the current one, so a borrowed session cannot lock the owner out.
 * Every other session is revoked on success: if the old password leaked — which
 * is exactly why someone would be changing it — any session opened with it
 * should stop working immediately.
 */
export const POST = route(async (request: NextRequest) => {
  const actor = await requireActor();
  const input = schema.parse(await request.json());

  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.userId } });
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    return fail(401, "Your current password is incorrect");
  }
  if (input.currentPassword === input.newPassword) {
    return fail(422, "The new password must be different");
  }

  const meta = await requestMeta();
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(input.newPassword) },
    });
    // Keep the caller signed in; drop everything else.
    await tx.session.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await recordAudit(
      { action: "user.role_changed", entityType: "User", entityId: user.id, actorId: user.id, detail: { change: "password" }, ...meta },
      tx,
    );
  });

  return ok({ ok: true, otherSessionsRevoked: true, signInAgain: true });
});
