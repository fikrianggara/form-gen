import { NextRequest } from "next/server";
import { jsonOk, jsonError } from "@/lib/http";
import { getInvitationByToken, markInvitationClicked } from "@/services/invitation.service";

interface Params {
  params: { token: string };
}

/**
 * Validate a unique invitation link. Marks the invitation as clicked and
 * returns the questionnaire + email — no Response row is created here
 * (TKT-001 lazy creation happens on the respondent's first save).
 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const invitation = await getInvitationByToken(params.token);
    if (!invitation) {
      return jsonOk({ valid: false });
    }
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
    return jsonError(err);
  }
}
