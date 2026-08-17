import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey } from "@/services/api-key.service";
import { parsePageParams, pageMeta } from "@/lib/api-pagination";
import { NotFoundError } from "@/lib/errors";

/** List responses for a questionnaire (paged, filters: status, from, to). */
export const GET = withApiKey(
  async (request: NextRequest, { params }: { params: Record<string, string> }) => {
    const questionnaire = await db.questionnaire.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!questionnaire) throw new NotFoundError("Questionnaire not found");

    const { searchParams } = request.nextUrl;
    const { page, pageSize, skip, take } = parsePageParams(searchParams);
    const statusParam = searchParams.get("status");
    const status =
      statusParam === "DRAFT" || statusParam === "SUBMITTED" || statusParam === "EDITED" || statusParam === "APPROVED"
        ? (statusParam as "DRAFT" | "SUBMITTED" | "EDITED" | "APPROVED")
        : null;
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const where = {
      questionnaireId: params.id,
      ...(status ? { status } : {}),
      ...(from ? { createdAt: { gte: new Date(from) } } : {}),
      ...(to ? { createdAt: { lte: new Date(to) } } : {}),
    };

    const [items, total] = await Promise.all([
      db.response.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: { _count: { select: { answers: true, answerGroups: true } } },
      }),
      db.response.count({ where }),
    ]);

    return Response.json({ data: items, meta: pageMeta(page, pageSize, total) });
  },
  "responses:read"
);
