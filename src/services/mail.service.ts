export interface MailMessage {
  to: string;
  subject: string;
  html: string;
}

export type MailTransport = (msg: MailMessage) => Promise<void>;

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
  const subject = input.isReminder
    ? `Reminder: ${input.questionnaireTitle}`
    : `You're invited: ${input.questionnaireTitle}`;
  const intro = input.isReminder
    ? `You haven't completed <strong>${input.questionnaireTitle}</strong> yet — a friendly reminder.`
    : `You've been invited to complete <strong>${input.questionnaireTitle}</strong>.`;
  return {
    to: input.to,
    subject,
    html: [
      `<p>${intro}</p>`,
      `<p>Open your unique link to start:</p>`,
      `<p><a href="${input.link}">${input.link}</a></p>`,
      `<p>This link is personal to you and can be used once.</p>`,
    ].join("\n"),
  };
}
