import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getQuestionnaireReport } from "@/services/report.service";
import { withApiKey } from "@/services/api-key.service";
import { NotFoundError } from "@/lib/errors";

/** Aggregated report data for a questionnaire (analysis v03 §4). */
export const GET = withApiKey(
  async (_request: NextRequest, { params }: { params: Record<string, string> }) => {
    const questionnaire = await db.questionnaire.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!questionnaire) throw new NotFoundError("Questionnaire not found");

    const report = await getQuestionnaireReport(params.id);
    if (!report) throw new NotFoundError("Report not available");
    return Response.json({ data: report });
  },
  "reports:read"
);
