import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError, NotFoundError } from "@/lib/errors";
import {
  buildProposalVerificationMail,
  consoleTransport,
  sendMail,
  type MailTransport,
} from "@/services/mail.service";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ProposalInput {
  title: string;
  purpose?: string | null;
  target?: string | null;
  outline?: unknown;
  verifyEmail?: string | null;
}

function assertOutline(outline: unknown): void {
  if (outline === undefined || outline === null) return;
  if (!Array.isArray(outline)) {
    throw new AppError("Outline must be a list of { title, type } rows", 422, "OUTLINE_INVALID");
  }
  for (const row of outline) {
    const r = row as { title?: unknown; type?: unknown };
    if (!r || typeof r.title !== "string" || typeof r.type !== "string") {
      throw new AppError("Each outline row needs a title and a type", 422, "OUTLINE_INVALID");
    }
  }
}

function assertVerifyEmail(email: string | null | undefined): void {
  if (email && !EMAIL_RE.test(email)) {
    throw new AppError("Verification email is not valid", 422, "EMAIL_INVALID");
  }
}

export async function createProposal(input: {
  organizationId: string;
  createdBy: string;
  title: string;
  purpose?: string | null;
  target?: string | null;
  outline?: unknown;
  verifyEmail?: string | null;
}) {
  const title = input.title.trim();
  if (!title) throw new AppError("Proposal title is required", 422, "TITLE_REQUIRED");
  assertOutline(input.outline);
  assertVerifyEmail(input.verifyEmail);

  const org = await db.organization.findUnique({ where: { id: input.organizationId } });
  if (!org) throw new NotFoundError("Organization not found");

  return db.proposal.create({
    data: {
      organizationId: org.id,
      createdBy: input.createdBy,
      title,
      purpose: input.purpose ?? null,
      target: input.target ?? null,
      outline: (input.outline as Prisma.InputJsonValue) ?? null,
      verifyEmail: input.verifyEmail ?? null,
    },
  });
}

export async function getProposal(id: string) {
  const proposal = await db.proposal.findUnique({ where: { id } });
  if (!proposal) throw new NotFoundError("Proposal not found");
  return proposal;
}

export async function updateProposal(
  id: string,
  input: Partial<ProposalInput>
) {
  const proposal = await getProposal(id);
  if (proposal.status !== "DRAFT") {
    throw new AppError("Only DRAFT proposals can be edited", 409, "NOT_DRAFT");
  }
  if (input.title !== undefined) assertOutline(input.outline ?? proposal.outline);
  if (input.verifyEmail !== undefined) assertVerifyEmail(input.verifyEmail);

  return db.proposal.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.purpose !== undefined ? { purpose: input.purpose ?? null } : {}),
      ...(input.target !== undefined ? { target: input.target ?? null } : {}),
      ...(input.outline !== undefined
        ? { outline: (input.outline as Prisma.InputJsonValue) ?? null }
        : {}),
      ...(input.verifyEmail !== undefined ? { verifyEmail: input.verifyEmail ?? null } : {}),
    },
  });
}

/**
 * Submit a DRAFT proposal. With a verification email it moves to
 * PENDING_VERIFICATION and emails a one-time token link; without one the
 * verification step is skipped and it lands directly in VERIFIED.
 */
export async function submitProposal(
  id: string,
  transport: MailTransport = consoleTransport
) {
  const proposal = await getProposal(id);
  if (proposal.status !== "DRAFT") {
    throw new AppError("Only DRAFT proposals can be submitted", 409, "NOT_DRAFT");
  }

  if (!proposal.verifyEmail) {
    return db.proposal.update({
      where: { id },
      data: { status: "VERIFIED", verifiedAt: new Date() },
    });
  }

  const token = randomUUID();
  const link = `/proposals/verify/${token}`;
  const msg = buildProposalVerificationMail({
    to: proposal.verifyEmail,
    link,
    proposalTitle: proposal.title,
  });
  const { delivered, error } = await sendMail(msg, transport);
  if (!delivered) {
    throw new AppError(
      `Failed to send the verification email${error ? `: ${error}` : ""}`,
      502,
      "VERIFY_MAIL_FAILED"
    );
  }

  return db.proposal.update({
    where: { id },
    data: { status: "PENDING_VERIFICATION", verificationToken: token },
  });
}

/** Verify a proposal from its emailed token link. */
export async function verifyProposalToken(token: string) {
  const proposal = await db.proposal.findFirst({
    where: { verificationToken: token },
  });
  if (!proposal) throw new NotFoundError("Verification link is invalid or has expired");
  if (proposal.status === "PENDING_VERIFICATION") {
    return db.proposal.update({
      where: { id: proposal.id },
      data: { status: "VERIFIED", verifiedAt: new Date() },
    });
  }
  return proposal;
}

/** Approve a VERIFIED proposal: creates the Survey it will hold. */
export async function approveProposal(id: string) {
  const proposal = await getProposal(id);
  if (proposal.status !== "VERIFIED") {
    throw new AppError("Only VERIFIED proposals can be approved", 409, "NOT_VERIFIED");
  }
  if (proposal.approvedAt) return proposal;

  const survey = await db.survey.create({
    data: {
      organizationId: proposal.organizationId,
      name: proposal.title,
      description: proposal.purpose,
    },
  });

  return db.proposal.update({
    where: { id },
    data: { status: "APPROVED", approvedAt: new Date(), surveyId: survey.id },
  });
}

/** Org-scoped proposal list, newest first. */
export async function listProposals(organizationId: string) {
  return db.proposal.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    include: { creator: { select: { id: true, name: true } } },
  });
}
