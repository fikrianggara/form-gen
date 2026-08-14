import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { AppError, NotFoundError } from "@/lib/errors";

/** Length of the opaque unique-link token. */
export const INVITATION_TOKEN_LENGTH = 32;

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
): Promise<Array<{ id: string; email: string; token: string; clickedAt: Date | null; responseId: string | null }>> {
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
        select: { id: true, email: true, token: true, clickedAt: true, responseId: true },
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
