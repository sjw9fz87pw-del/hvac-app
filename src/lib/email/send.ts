/**
 * Outbound email.
 *
 * Sending is optional on purpose. Until a provider is configured the app still
 * works: the caller gets `{ sent: false }` back and the admin screen shows the
 * link to pass on by hand. That means invitations are useful on day one without
 * waiting on a domain to be verified, and start arriving by email the moment a
 * key is set — no code change either way.
 *
 * Resend is the provider because it is a single authenticated POST; there is no
 * SDK to add to the bundle.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain text. Deliberately not HTML: these are short, and text always renders. */
  text: string;
}

export type SendResult =
  | { sent: true }
  | { sent: false; reason: "not_configured" | "failed"; detail?: string };

function fromAddress(): string | null {
  return process.env.EMAIL_FROM ?? null;
}

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && fromAddress());
}

export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  const from = fromAddress();
  if (!key || !from) return { sent: false, reason: "not_configured" };

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text }),
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
