import { NextRequest } from "next/server";
import { jsonOk, jsonError } from "@/lib/http";
import { validateInvitationForForm, markInvitationClicked } from "@/services/invitation.service";
import { AppError } from "@/lib/errors";

interface Params {
  params: { token: string };
}

/** Map a validation failure to a stable, client-addressable reason. */
function reasonFor(code: string): string | null {
  switch (code) {
    case "INVITATION_NOT_FOUND":
      return "not_found";
    case "INVITATION_REVOKED":
      return "revoked";
    case "INVITATION_EXPIRED":
      return "expired";
    case "INVITATION_ALREADY_USED":
      return "already_used";
    default:
      return null;
  }
}

/**
 * Validate a unique invitation link (TKT-020 hardening). Rejects revoked and
 * expired tokens; tokens whose linked response is COMPLETED are also rejected.
 * Draft-linked tokens stay valid so the respondent can resume editing — the
 * POST gate prevents creating a second response. No Response row is created
 * here (TKT-001 lazy creation happens on the respondent's first save).
 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const invitation = await validateInvitationForForm(params.token);
    await markInvitationClicked(params.token);
    return jsonOk({
      valid: true,
      email: invitation.email,
      questionnaire: {
        id: invitation.questionnaire.id,
        slug: invitation.questionnaire.slug,
        title: invitation.questionnaire.title,
      },
    });
  } catch (err) {
    if (err instanceof AppError) {
      const reason = reasonFor(err.code);
      if (reason) return jsonOk({ valid: false, reason });
    }
    return jsonError(err);
  }
}
