import { NextRequest } from "next/server";
import { getQuestionnaireConfig } from "@/services/response.service";
import { jsonOk, jsonError } from "@/lib/http";
import { NotFoundError } from "@/lib/errors";

interface Params {
  params: { slug: string };
}

/** Public form config for a questionnaire (ACTIVE only). */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const config = await getQuestionnaireConfig(params.slug);
    if (!config || config.status !== "ACTIVE") {
      throw new NotFoundError("Questionnaire not found or not active");
    }
    return jsonOk({ questionnaire: config });
  } catch (err) {
    return jsonError(err);
  }
}
