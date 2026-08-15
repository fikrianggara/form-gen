import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { AppError, NotFoundError } from "@/lib/errors";
import {
  buildInvitationMail,
  sendMail,
  consoleTransport,
  type MailTransport,
} from "@/services/mail.service";

/** Length of the opaque unique-link token. */
export const INVITATION_TOKEN_LENGTH = 32;

/** How long an invitation link stays valid after creation (env-tunable). */
export const INVITATION_TTL_DAYS = Number(process.env.INVITATION_TTL_DAYS ?? 30);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function generateToken(): string {
  return randomBytes(INVITATION_TOKEN_LENGTH / 2).toString("hex");
}

/**
 * Create one unique invitation link per sample email. Creates Invitation rows
 * ONLY — no Response/questionnaire data is written (lazy creation happens on
 * first save, see TKT-001).
 */
export async function generateInvitations(
  questionnaireId: string,
  emails: string[]
): Promise<
  Array<{
    id: string;
    email: string;
    token: string;
    clickedAt: Date | null;
    revokedAt: Date | null;
    responseId: string | null;
  }>
> {
  const q = await db.questionnaire.findUnique({ where: { id: questionnaireId } });
  if (!q) throw new NotFoundError("Questionnaire not found");

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const raw of emails) {
    const email = normalizeEmail(raw);
    if (!EMAIL_RE.test(email) || seen.has(email)) continue;
    seen.add(email);
    unique.push(email);
  }
  if (unique.length === 0) {
    throw new AppError("No valid sample emails provided", 422, "NO_VALID_EMAILS");
  }

  const rows = await db.$transaction(
    unique.map((email) =>
      db.invitation.create({
        data: { questionnaireId, email, token: generateToken() },
        select: {
          id: true,
          email: true,
          token: true,
          clickedAt: true,
          revokedAt: true,
          responseId: true,
        },
      })
    )
  );
  return rows;
}

/** Resolve an invitation by its unique token (null when unknown). */
export async function getInvitationByToken(token: string) {
  return db.invitation.findUnique({
    where: { token },
    include: {
      questionnaire: { select: { id: true, slug: true, title: true } },
    },
  });
}

/** Mark the invitation's link as clicked (no Response is created here). */
export async function markInvitationClicked(token: string) {
  return db.invitation.update({
    where: { token },
    data: { clickedAt: new Date() },
  });
}

/** Record which lazily-created Response came from this invitation. */
export async function linkInvitationToResponse(token: string, responseId: string) {
  return db.invitation.update({
    where: { token },
    data: { responseId },
  });
}

function assertInvitationOpen(inv: { revokedAt: Date | null; createdAt: Date }): void {
  if (inv.revokedAt) {
    throw new AppError("This invitation link has been revoked.", 403, "INVITATION_REVOKED");
  }
  const ttlMs = INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000;
  if (inv.createdAt.getTime() + ttlMs < Date.now()) {
    throw new AppError("This invitation link has expired.", 410, "INVITATION_EXPIRED");
  }
}

/**
 * TKT-020: strict single-use gate for CREATING a new response with an
 * invitation token. Rejects revoked/expired tokens and any token already
 * linked to a response — a second POST can no longer mint another row.
 */
export async function validateInvitationForCreate(token: string) {
  const invitation = await getInvitationByToken(token);
  if (!invitation) {
    throw new AppError("Invitation not found", 404, "INVITATION_NOT_FOUND");
  }
  assertInvitationOpen(invitation);
  if (invitation.responseId) {
    throw new AppError(
      "This invitation link has already been used.",
      409,
      "INVITATION_ALREADY_USED"
    );
  }
  return invitation;
}

/**
 * TKT-020: form-open gate. Rejects revoked/expired tokens, and tokens whose
 * linked response is no longer a draft (SUBMITTED/EDITED/APPROVED after the
 * TKT-024 status workflow). Draft-linked tokens still open the form so the
 * respondent can resume editing — the POST gate prevents new rows.
 */
export async function validateInvitationForForm(token: string) {
  const invitation = await getInvitationByToken(token);
  if (!invitation) {
    throw new AppError("Invitation not found", 404, "INVITATION_NOT_FOUND");
  }
  assertInvitationOpen(invitation);
  if (invitation.responseId) {
    const response = await db.response.findUnique({ where: { id: invitation.responseId } });
    if (response && response.status !== "DRAFT") {
      throw new AppError(
        "This invitation link has already been used.",
        409,
        "INVITATION_ALREADY_USED"
      );
    }
  }
  return invitation;
}

/** Admin revoke: invalidate the token immediately (row kept for audit). */
export async function revokeInvitation(invitationId: string) {
  const existing = await db.invitation.findUnique({ where: { id: invitationId } });
  if (!existing) throw new NotFoundError("Invitation not found");
  return db.invitation.update({
    where: { id: invitationId },
    data: { revokedAt: new Date() },
  });
}

function parseSampleEmails(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((e): e is string => typeof e === "string");
}

/**
 * Mailblast: generate one unique link per sample email stored on the
 * questionnaire and send each via the mail transport. Still creates NO
 * Response rows — responses only appear on the respondent's first save.
 * Returns the invitations with their public links.
 */
export async function sendInvitations(
  questionnaireId: string,
  transport: MailTransport = consoleTransport
): Promise<
  Array<{
    id: string;
    email: string;
    token: string;
    link: string;
    sentAt: Date | null;
    clickedAt: Date | null;
    revokedAt: Date | null;
    responseId: string | null;
  }>
> {
  const q = await db.questionnaire.findUnique({ where: { id: questionnaireId } });
  if (!q) throw new NotFoundError("Questionnaire not found");

  const emails = parseSampleEmails(q.sampleEmails);
  if (emails.length === 0) {
    throw new AppError("No sample emails on this questionnaire", 422, "NO_SAMPLE_EMAILS");
  }

  const invitations = await generateInvitations(questionnaireId, emails);

  const results = await Promise.all(
    invitations.map(async (inv) => {
      const link = `/f/${q.slug}?invite=${inv.token}`;
      const msg = buildInvitationMail({
        to: inv.email,
        link,
        questionnaireTitle: q.title,
      });
      const { delivered } = await sendMail(msg, transport);
      if (delivered) {
        const updated = await db.invitation.update({
          where: { id: inv.id },
          data: { sentAt: new Date() },
          select: {
            id: true,
            email: true,
            token: true,
            sentAt: true,
            clickedAt: true,
            revokedAt: true,
            responseId: true,
          },
        });
        return { ...updated, link };
      }
      const fresh = await db.invitation.findUniqueOrThrow({
        where: { id: inv.id },
        select: {
          id: true,
          email: true,
          token: true,
          sentAt: true,
          clickedAt: true,
          revokedAt: true,
          responseId: true,
        },
      });
      return { ...fresh, link };
    })
  );

  return results;
}
