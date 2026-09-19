import { prisma } from "@/lib/db/client";
import { verifyInviteToken, peekUserId } from "@/lib/auth/invite";
import { AcceptInviteForm } from "./form";

/**
 * The page an invitation link opens. Public — there is no account to sign in
 * with yet — so it reveals nothing beyond the first name of whoever the link
 * was issued to, and only once the signature checks out.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const userId = peekUserId(token);
  const user = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null;
  const result = verifyInviteToken(token, user?.passwordHash ?? "no-such-user");
  const valid = Boolean(user?.active) && result.ok;

  return (
    <AcceptInviteForm
      token={token}
      valid={valid}
      firstName={valid ? (user!.name.split(" ")[0] ?? null) : null}
      email={valid ? user!.email : null}
      companyName={valid ? "Equipment Care" : null}
    />
  );
}
