import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { saveResponseSchema } from "@/lib/schemas";
import { jsonOk, jsonError, isValidRespondentToken } from "@/lib/http";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { createResponse, createResponseWithState } from "@/services/response.service";
import {
  getInvitationByToken,
  linkInvitationToResponse,
  validateInvitationForCreate,
} from "@/services/invitation.service";
import {
  assertResponseSubmissionAllowed,
  recordResponseSubmission,
} from "@/services/rate-limit.service";

interface Params {
  params: { slug: string };
}

/** Best-effort client IP (respects the common reverse-proxy headers). */
function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

/** Resume the latest response for a respondent token. */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const token = req.nextUrl.searchParams.get("token");
    if (!isValidRespondentToken(token)) {
      throw new ValidationError("A valid respondent token is required");
    }
    const questionnaire = await db.questionnaire.findUnique({
      where: { slug: params.slug },
      select: { id: true },
    });
    if (!questionnaire) {
      return jsonOk({ response: null });
    }
    const response = await db.response.findFirst({
      where: { questionnaireId: questionnaire.id, respondentToken: token },
      orderBy: { createdAt: "desc" },
      include: { answers: true, answerGroups: { include: { answers: true } } },
    });
    return jsonOk({ response });
  } catch (err) {
    return jsonError(err);
  }
}

/**
 * Create a response for a questionnaire.
 * - Anonymous bootstrap (no state): creates a blank draft (existing behavior).
 * - Unique-link flow (state present, TKT-001): lazily creates the response AND
 *   persists the current form state atomically — never a blank row.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const body = saveResponseSchema.safeParse(await req.json());
    if (!body.success) {
      throw new ValidationError("Invalid request body");
    }
    if (!isValidRespondentToken(body.data.token)) {
      throw new ValidationError("A valid respondent token is required");
    }

    const questionnaire = await db.questionnaire.findUnique({
      where: { slug: params.slug },
      select: { id: true },
    });
    if (!questionnaire) throw new NotFoundError("Questionnaire not found");

    // TKT-023: throttle public submissions (per token/IP, IP, questionnaire).
    // Check + record BEFORE any write so over-limit requests never create rows.
    const ip = clientIp(req);
    await assertResponseSubmissionAllowed(body.data.token, ip, questionnaire.id);
    await recordResponseSubmission(body.data.token, ip, questionnaire.id);

    // TKT-020: when the token IS an invitation link, enforce expiry/revoke and
    // strict single-use BEFORE minting another response row. Anonymous
    // respondent tokens (no invitation) keep their existing behavior.
    const invitation = await getInvitationByToken(body.data.token);
    if (invitation) {
      await validateInvitationForCreate(body.data.token);
    }

    const hasState =
      (body.data.answers?.length ?? 0) > 0 ||
      (body.data.groups?.length ?? 0) > 0 ||
      body.data.status === "COMPLETED";

    let response;
    if (hasState) {
      response = await createResponseWithState(
        questionnaire.id,
        body.data.token,
        body.data.respondentLabel ?? null,
        {
          status: body.data.status,
          answers: body.data.answers,
          groups: body.data.groups,
          respondentLabel: body.data.respondentLabel,
        }
      );
      if (!response) throw new NotFoundError("Response not created");
      // Remember which invitation this response came from (best effort).
      await linkInvitationToResponse(body.data.token, response.id).catch(() => {});
    } else {
      response = await createResponse(
        questionnaire.id,
        body.data.token,
        body.data.respondentLabel ?? null
      );
      if (!response) throw new NotFoundError("Response not created");
    }
    return jsonOk(
      { response: { id: response.id, status: response.status, progress: response.progress } },
      201
    );
  } catch (err) {
    return jsonError(err);
  }
}
