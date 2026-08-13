import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { createResponseSchema } from "@/lib/schemas";
import { jsonOk, jsonError, isValidRespondentToken } from "@/lib/http";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { createResponse } from "@/services/response.service";

interface Params {
  params: { slug: string };
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

/** Create a response for a questionnaire (or resume an existing one). */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const body = createResponseSchema.safeParse(await req.json());
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

    const response = await createResponse(
      questionnaire.id,
      body.data.token,
      body.data.respondentLabel ?? null
    );
    return jsonOk(
      { response: { id: response.id, status: response.status, progress: response.progress } },
      201
    );
  } catch (err) {
    return jsonError(err);
  }
}
