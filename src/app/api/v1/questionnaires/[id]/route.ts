import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey } from "@/services/api-key.service";
import { NotFoundError } from "@/lib/errors";

/** Questionnaire detail incl. blocks/questions/options (analysis v03 §4). */
export const GET = withApiKey(
  async (_request: NextRequest, { params }: { params: Record<string, string> }) => {
    const questionnaire = await db.questionnaire.findUnique({
      where: { id: params.id },
      include: {
        blocks: { orderBy: { order: "asc" } },
        questions: {
          orderBy: { order: "asc" },
          include: {
            optionSet: { include: { options: { orderBy: { order: "asc" } } } },
            questionMaster: { include: { optionSet: { include: { options: { orderBy: { order: "asc" } } } } } },
            children: {
              orderBy: { order: "asc" },
              include: {
                optionSet: { include: { options: { orderBy: { order: "asc" } } } },
                questionMaster: { include: { optionSet: { include: { options: { orderBy: { order: "asc" } } } } } },
              },
            },
          },
        },
      },
    });
    if (!questionnaire) throw new NotFoundError("Questionnaire not found");
    return Response.json({ data: questionnaire });
  },
  "questionnaires:read"
);
