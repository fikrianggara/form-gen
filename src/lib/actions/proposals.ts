"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/http";
import { requirePermission } from "@/lib/auth/rbac";
import { toAppError } from "@/lib/errors";
import { getProposal } from "@/services/proposal.service";
import {
  createProposal,
  updateProposal,
  submitProposal,
  approveProposal,
} from "@/services/proposal.service";

function actionError(err: unknown): { error: string } {
  return { error: toAppError(err).message };
}

/** Org gate: ADMIN can touch any proposal; operators only their org's. */
async function assertCanManageProposal(proposalId: string) {
  const session = await getSession();
  requirePermission(session, "MANAGE_QUESTIONNAIRES");
  const proposal = await getProposal(proposalId);
  if (session.role !== "ADMIN" && proposal.organizationId !== session.organizationId) {
    throw new Error("You can only manage proposals in your organization");
  }
  return proposal;
}

export async function saveProposalAction(input: {
  id?: string;
  organizationId?: string | null;
  title: string;
  purpose?: string | null;
  target?: string | null;
  outline?: unknown;
  verifyEmail?: string | null;
}): Promise<{ error?: string; id?: string }> {
  try {
    const session = await getSession();
    requirePermission(session, "MANAGE_QUESTIONNAIRES");

    if (input.id) {
      await assertCanManageProposal(input.id);
      await updateProposal(input.id, {
        title: input.title,
        purpose: input.purpose,
        target: input.target,
        outline: input.outline,
        verifyEmail: input.verifyEmail,
      });
    } else {
      const organizationId =
        input.organizationId ?? session.organizationId;
      if (!organizationId) {
        return { error: "You must belong to an organization to create proposals" };
      }
      if (session.role !== "ADMIN" && organizationId !== session.organizationId) {
        return { error: "You can only create proposals in your organization" };
      }
      const created = await createProposal({
        organizationId,
        createdBy: session.sub,
        title: input.title,
        purpose: input.purpose,
        target: input.target,
        outline: input.outline,
        verifyEmail: input.verifyEmail,
      });
      revalidatePath("/dashboard/proposals");
      return { id: created.id };
    }
    revalidatePath("/dashboard/proposals");
    return { id: input.id };
  } catch (err) {
    return actionError(err);
  }
}

export async function submitProposalAction(input: {
  id: string;
}): Promise<{ error?: string }> {
  try {
    await assertCanManageProposal(input.id);
    await submitProposal(input.id);
  } catch (err) {
    return actionError(err);
  }
  revalidatePath("/dashboard/proposals");
  return {};
}

export async function approveProposalAction(input: {
  id: string;
}): Promise<{ error?: string; surveyId?: string }> {
  try {
    await assertCanManageProposal(input.id);
    const approved = await approveProposal(input.id);
    revalidatePath("/dashboard/proposals");
    return { surveyId: approved.surveyId ?? undefined };
  } catch (err) {
    return actionError(err);
  }
}
