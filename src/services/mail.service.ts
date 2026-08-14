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
  return {
    to: input.to,
    subject: `You're invited: ${input.questionnaireTitle}`,
    html: [
      `<p>You've been invited to complete <strong>${input.questionnaireTitle}</strong>.</p>`,
      `<p>Open your unique link to start:</p>`,
      `<p><a href="${input.link}">${input.link}</a></p>`,
      `<p>This link is personal to you and can be used once.</p>`,
    ].join("\n"),
  };
}
