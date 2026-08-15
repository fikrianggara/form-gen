import { db } from "@/lib/db";
import { AppError, NotFoundError } from "@/lib/errors";
import { generateInvitations } from "@/services/invitation.service";
import {
  buildInvitationMail,
  consoleTransport,
  sendMail,
  type MailTransport,
} from "@/services/mail.service";

/**
 * Admin/operator response actions (TKT-017). Permission gating happens in the
 * server actions / routes via `assertCanManageQuestionnaire` — these services
 * only do the data work.
 */

/** Delete a response (answers cascade via FK) and detach any linked invitation. */
export async function deleteResponse(responseId: string): Promise<void> {
  const response = await db.response.findUnique({ where: { id: responseId } });
  if (!response) throw new NotFoundError("Response not found");

  await db.$transaction([
    db.invitation.updateMany({
      where: { responseId },
      data: { responseId: null },
    }),
    db.response.delete({ where: { id: responseId } }),
  ]);
}

/**
 * Mailblast a single respondent: find-or-create a unique invitation for their
 * email and send the questionnaire link. Creates NO response rows (consistent
 * with TKT-001 lazy creation).
 */
export async function mailblastRespondent(
  responseId: string,
  transport: MailTransport = consoleTransport
): Promise<{ id: string; email: string; token: string; link: string; sentAt: Date | null }> {
  const response = await db.response.findUnique({
    where: { id: responseId },
    include: { questionnaire: true },
  });
  if (!response) throw new NotFoundError("Response not found");
  const email = response.respondentLabel?.trim();
  if (!email) {
    throw new AppError("This response has no email to send to", 422, "NO_RESPONDENT_EMAIL");
  }

  let invitation: {
    id: string;
    email: string;
    token: string;
  } | null = await db.invitation.findFirst({
    where: { questionnaireId: response.questionnaireId, email },
    select: { id: true, email: true, token: true },
  });
  if (!invitation) {
    [invitation] = await generateInvitations(response.questionnaireId, [email]);
  }
  if (!invitation) throw new AppError("Could not create an invitation", 500, "INVITE_FAILED");

  const link = `/f/${response.questionnaire.slug}?invite=${invitation.token}`;
  const msg = buildInvitationMail({
    to: invitation.email,
    link,
    questionnaireTitle: response.questionnaire.title,
  });
  const { delivered } = await sendMail(msg, transport);
  if (delivered) {
    const updated = await db.invitation.update({
      where: { id: invitation.id },
      data: { sentAt: new Date() },
      select: { id: true, email: true, token: true, sentAt: true },
    });
    return { ...updated, link };
  }
  return {
    id: invitation.id,
    email: invitation.email,
    token: invitation.token,
    link,
    sentAt: null,
  };
}
