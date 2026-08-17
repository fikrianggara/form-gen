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
 * Never throws: returns `delivered:false` plus the error message on failure so
 * callers can record delivery status (TKT-013).
 */
export async function sendMail(
  msg: MailMessage,
  transport: MailTransport = consoleTransport
): Promise<{ delivered: boolean; error?: string }> {
  try {
    await transport(msg);
    return { delivered: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown mail error";
    console.error("[mail] send failed:", err);
    return { delivered: false, error: message };
  }
}

/** Build the invitation email body for a questionnaire's unique link. */
export function buildInvitationMail(input: {
  to: string;
  link: string;
  questionnaireTitle: string;
  isReminder?: boolean;
}): MailMessage {
  const title = escapeHtml(input.questionnaireTitle);
  const link = escapeHtml(input.link);
  // Subject is plain text — keep it human-readable (only the HTML body
  // gets escaped; see TKT-021 tests).
  const subject = input.isReminder
    ? `Reminder: ${input.questionnaireTitle}`
    : `You're invited: ${input.questionnaireTitle}`;
  const intro = input.isReminder
    ? `You haven't completed <strong>${title}</strong> yet — a friendly reminder.`
    : `You've been invited to complete <strong>${title}</strong>.`;
  return {
    to: input.to,
    subject,
    html: [
      `<p>${intro}</p>`,
      `<p>Open your unique link to start:</p>`,
      `<p><a href="${link}">${link}</a></p>`,
      `<p>This link is personal to you and can be used once.</p>`,
    ].join("\n"),
  };
}

/** Build the survey-proposal verification email (TKT-005). */
export function buildProposalVerificationMail(input: {
  to: string;
  link: string;
  proposalTitle: string;
}): MailMessage {
  const title = escapeHtml(input.proposalTitle);
  const link = escapeHtml(input.link);
  return {
    to: input.to,
    subject: `Verify survey proposal: ${input.proposalTitle}`,
    html: [
      `<p>A survey proposal titled <strong>${title}</strong> is awaiting your verification.</p>`,
      `<p>Open the link below to approve its content and move it forward:</p>`,
      `<p><a href="${link}">${link}</a></p>`,
      `<p>If you didn't expect this email, you can safely ignore it.</p>`,
    ].join("\n"),
  };
}
