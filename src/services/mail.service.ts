export interface MailMessage {
  to: string;
  subject: string;
  html: string;
}

export type MailTransport = (msg: MailMessage) => Promise<void>;

/**
 * Escape a value for safe interpolation into HTML (TKT-021). Prevents a
 * questionnaire title or link containing markup from injecting into the
 * email body.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Console fallback transport: logs the mail so dev/test environments don't
 * need an SMTP server. Recorded via console.log (swappable in tests).
 */
export const consoleTransport: MailTransport = async (msg) => {
  console.log(
    `[mail:fallback] to=${msg.to} subject=${msg.subject}\n${msg.html}`
  );
};

/**
 * Send a mail through the given transport (defaults to the console fallback).
 * Never throws: returns `delivered:false` on failure so callers can decide.
 */
export async function sendMail(
  msg: MailMessage,
  transport: MailTransport = consoleTransport
): Promise<{ delivered: boolean }> {
  try {
    await transport(msg);
    return { delivered: true };
  } catch (err) {
    console.error("[mail] send failed:", err);
    return { delivered: false };
  }
}

/** Build the invitation email body for a questionnaire's unique link. */
export function buildInvitationMail(input: {
  to: string;
  link: string;
  questionnaireTitle: string;
}): MailMessage {
  const title = escapeHtml(input.questionnaireTitle);
  const link = escapeHtml(input.link);
  return {
    to: input.to,
    subject: `You're invited: ${input.questionnaireTitle}`,
    html: [
      `<p>You've been invited to complete <strong>${title}</strong>.</p>`,
      `<p>Open your unique link to start:</p>`,
      `<p><a href="${link}">${link}</a></p>`,
      `<p>This link is personal to you and can be used once.</p>`,
    ].join("\n"),
  };
}
