/**
 * Outbound email.
 *
 * Two ways to send, picked by whichever is configured:
 *
 *   SMTP     — SMTP_USER + SMTP_PASSWORD. Sends as that mailbox using an app
 *              password, so a Gmail or Outlook account works with no DNS setup
 *              at all. This is the low-friction route.
 *   Resend   — RESEND_API_KEY + EMAIL_FROM. Needs a verified sending domain,
 *              which is more work but is what survives volume and keeps
 *              invitations out of spam at scale.
 *
 * Neither is required. With nothing configured the caller gets `{ sent: false }`
 * and the admin screen shows the link to pass on by hand, so invitations work
 * on day one and start arriving by email the moment credentials appear — no
 * code change either way.
 *
 * Whatever the route, replies go to REPLY_TO (or the SMTP mailbox), because a
 * no-reply invitation that a confused recipient cannot answer is a dead end.
 */
import nodemailer from "nodemailer";
export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain text. Deliberately not HTML: these are short, and text always renders. */
  text: string;
}

export type SendResult =
  | { sent: true }
  | { sent: false; reason: "not_configured" | "failed"; detail?: string };

function smtpCredentials(): { user: string; pass: string; host: string; port: number } | null {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!user || !pass) return null;
  return {
    user,
    pass,
    // Defaults suit Gmail; any provider works by overriding them.
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT ?? 465),
  };
}

function fromAddress(): string | null {
  // An explicit EMAIL_FROM wins; otherwise send as the SMTP mailbox itself,
  // which is the only address that mailbox is actually allowed to send as.
  return process.env.EMAIL_FROM ?? smtpCredentials()?.user ?? null;
}

function replyTo(): string | undefined {
  return process.env.REPLY_TO ?? smtpCredentials()?.user ?? undefined;
}

export function emailConfigured(): boolean {
  if (smtpCredentials()) return true;
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

/** Which route is live, for the screens that explain why nothing was sent. */
export function emailProvider(): "smtp" | "resend" | null {
  if (smtpCredentials()) return "smtp";
  if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) return "resend";
  return null;
}

async function sendViaSmtp(message: EmailMessage): Promise<SendResult> {
  const creds = smtpCredentials()!;
  try {
    const transport = nodemailer.createTransport({
      host: creds.host,
      port: creds.port,
      secure: creds.port === 465,
      auth: { user: creds.user, pass: creds.pass },
    });
    await transport.sendMail({
      from: fromAddress() ?? creds.user,
      to: message.to,
      replyTo: replyTo(),
      subject: message.subject,
      text: message.text,
    });
    return { sent: true };
  } catch (error) {
    // Usually a wrong app password or 2FA not enabled; surface it rather than
    // silently falling back to "send this by hand".
    return { sent: false, reason: "failed", detail: error instanceof Error ? error.message.slice(0, 300) : "unknown" };
  }
}

export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  if (smtpCredentials()) return sendViaSmtp(message);

  const key = process.env.RESEND_API_KEY;
  const from = fromAddress();
  if (!key || !from) return { sent: false, reason: "not_configured" };

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from, to: [message.to], subject: message.subject, text: message.text,
        ...(replyTo() ? { reply_to: replyTo() } : {}),
      }),
    });

    if (!response.ok) {
      // The body can name a misconfigured domain, which is the usual cause.
      const detail = await response.text().catch(() => "");
      return { sent: false, reason: "failed", detail: detail.slice(0, 300) };
    }
    return { sent: true };
  } catch (error) {
    return { sent: false, reason: "failed", detail: error instanceof Error ? error.message : "unknown" };
  }
}

export function inviteEmail(params: {
  name: string;
  companyName: string;
  link: string;
  expiresInHours: number;
}): EmailMessage {
  const days = Math.round(params.expiresInHours / 24);
  const validFor = days >= 1 ? `${days} day${days === 1 ? "" : "s"}` : `${params.expiresInHours} hours`;
  return {
    to: "",
    subject: `You've been given access to ${params.companyName}`,
    text: [
      `Hi ${params.name.split(" ")[0]},`,
      ``,
      `You've been given access to ${params.companyName}, which tracks preventive`,
      `maintenance on restaurant equipment.`,
      ``,
      `Choose your password to get started:`,
      params.link,
      ``,
      `This link works once and expires in ${validFor}. If it has expired, ask for a new one.`,
      `If you weren't expecting this, you can ignore it — nothing happens until the link is used.`,
    ].join("\n"),
  };
}

export function resetEmail(params: {
  name: string;
  companyName: string;
  link: string;
  expiresInHours: number;
}): EmailMessage {
  return {
    to: "",
    subject: `Reset your ${params.companyName} password`,
    text: [
      `Hi ${params.name.split(" ")[0]},`,
      ``,
      `Someone asked to reset the password on your ${params.companyName} account.`,
      ``,
      `Set a new one here:`,
      params.link,
      ``,
      `This link works once and expires in ${params.expiresInHours} hours.`,
      `If you didn't ask for this, ignore it — your current password still works.`,
    ].join("\n"),
  };
}
