import { db } from "@/lib/db";
import { AppError, NotFoundError } from "@/lib/errors";
import { generateInvitations } from "@/services/invitation.service";
import {
  buildInvitationMail,
  consoleTransport,
  sendMail,
  type MailTransport,
} from "@/services/mail.service";
import { saveResponse } from "@/services/response.service";
import type { SaveResponseInput } from "@/services/response.service";
import type { ResponseActorType } from "@prisma/client";

/**
 * Admin/operator response actions (TKT-017, TKT-024). Permission gating happens
 * in the server actions / routes via `assertCanManageQuestionnaire` — these
 * services only do the data work.
 */

/** Who performed an admin action — filled from the session by the action layer. */
export interface AdminActor {
  userId: string;
  name: string;
  role: "ADMIN" | "OPERATOR";
}

function actorTypeOf(role: AdminActor["role"]): ResponseActorType {
  return role === "ADMIN" ? "ADMIN" : "OPERATOR";
}

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
 * Admin/operator edits a response (TKT-024). Works on DRAFT, SUBMITTED and
 * EDITED responses; the edit records the actor and moves status to EDITED.
 * APPROVED responses are locked — approval is terminal.
 */
export async function editResponseAsAdmin(
  responseId: string,
  input: SaveResponseInput,
  actor: AdminActor
) {
  const response = await db.response.findUnique({ where: { id: responseId } });
  if (!response) throw new NotFoundError("Response not found");
  if (response.status === "APPROVED") {
    throw new AppError(
      "Approved responses can no longer be edited",
      409,
      "RESPONSE_APPROVED"
    );
  }
  const originalCompletedAt = response.completedAt;

  // Reuse the respondent write path with requireDraft:false (this is the admin
  // edit). Status "DRAFT" skips required-field validation so admins can save
  // partial fixes; saveResponse also clears completedAt, which we restore below
  // so the submission timestamp stays truthful.
  await saveResponse(
    responseId,
    { ...input, status: "DRAFT" },
    { requireDraft: false }
  );

  // Flip to EDITED + record the actor (TKT-024).
  return db.$transaction(async (tx) => {
    await tx.response.update({
      where: { id: responseId },
      data: { status: "EDITED", completedAt: originalCompletedAt },
    });
    await tx.responseAudit.create({
      data: {
        responseId,
        actorType: actorTypeOf(actor.role),
        actorUserId: actor.userId,
        actorLabel: actor.name,
        action: "ADMIN_EDIT",
        fromStatus: response.status,
        toStatus: "EDITED",
      },
    });
    return tx.response.findUnique({ where: { id: responseId } });
  });
}

/**
 * Admin/operator approves a response (TKT-024). Only SUBMITTED/EDITED
 * responses can be approved; approval is recorded with the actor.
 */
export async function approveResponse(responseId: string, actor: AdminActor) {
  const response = await db.response.findUnique({ where: { id: responseId } });
  if (!response) throw new NotFoundError("Response not found");
  if (response.status === "APPROVED") {
    throw new AppError("This response is already approved", 409, "RESPONSE_APPROVED");
  }
  if (response.status === "DRAFT") {
    throw new AppError(
      "Only submitted responses can be approved",
      422,
      "RESPONSE_NOT_SUBMITTED"
    );
  }

  return db.$transaction(async (tx) => {
    await tx.response.update({ where: { id: responseId }, data: { status: "APPROVED" } });
    await tx.responseAudit.create({
      data: {
        responseId,
        actorType: actorTypeOf(actor.role),
        actorUserId: actor.userId,
        actorLabel: actor.name,
        action: "APPROVE",
        fromStatus: response.status,
        toStatus: "APPROVED",
      },
    });
    return tx.response.findUnique({ where: { id: responseId } });
  });
}

/** Audit/history trail for one response, oldest first (TKT-024). */
export async function listResponseAudits(responseId: string) {
  return db.responseAudit.findMany({
    where: { responseId },
    orderBy: { createdAt: "asc" },
  });
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
