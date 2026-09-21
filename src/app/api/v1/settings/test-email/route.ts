import { requireCapability } from "@/lib/auth/session";
import { sendEmail, emailConfigured, emailProvider } from "@/lib/email/send";
import { ok, fail, route } from "@/lib/api/respond";

/**
 * Send a test message to whoever is asking.
 *
 * Deliberately only to the signed-in user's own address: a test that can be
 * aimed anywhere is a way to send mail from this company to strangers.
 *
 * The provider's own error text is passed straight through. Email fails for
 * boring, specific reasons — wrong app password, two-factor not switched on,
 * an unverified sending domain — and each of those says so plainly. Replacing
 * them with "could not send" would leave nothing to act on.
 */
export const POST = route(async () => {
  const actor = await requireCapability("settings.manage");

  if (!emailConfigured()) {
    return fail(409, "Email is not configured yet. Set SMTP_USER and SMTP_PASSWORD, or RESEND_API_KEY and EMAIL_FROM.");
  }

  const result = await sendEmail({
    to: actor.email,
    subject: "Equipment Care — email is working",
    text: [
      `Hi ${actor.name.split(" ")[0]},`,
      ``,
      `This is a test from Equipment Care. If you are reading it, invitations and`,
      `password resets will reach people the same way.`,
      ``,
      `Nothing to do — you can delete this.`,
    ].join("\n"),
  });

  if (!result.sent) {
    return fail(502, result.detail?.trim() || "The mail provider rejected the message.", {
      provider: emailProvider(),
      reason: result.reason,
    });
  }

  return ok({ sent: true, to: actor.email, provider: emailProvider() });
});
