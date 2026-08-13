import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { saveResponseSchema } from "@/lib/schemas";
import { jsonOk, jsonError, isValidRespondentToken } from "@/lib/http";
import { NotFoundError, ValidationError, ForbiddenError } from "@/lib/errors";
import { saveResponse } from "@/services/response.service";

interface Params {
  params: { slug: string; id: string };
}

/** Save a draft or complete a response (owner-only). */
export async function PATCH(req: NextRequest, { params }: Params) {
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

    const response = await db.response.findUnique({ where: { id: params.id } });
    if (!response) throw new NotFoundError("Response not found");
    if (response.questionnaireId !== questionnaire.id) {
      throw new NotFoundError("Response not found");
    }
    if (response.respondentToken !== body.data.token) {
      throw new ForbiddenError("You can only edit your own response");
    }

    const updated = await saveResponse(params.id, {
      status: body.data.status,
      answers: body.data.answers,
      groups: body.data.groups,
      respondentLabel: body.data.respondentLabel,
    });
    return jsonOk({
      response: {
        id: updated?.id,
        status: updated?.status,
        progress: updated?.progress,
        completedAt: updated?.completedAt,
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
