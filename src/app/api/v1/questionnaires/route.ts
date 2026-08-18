import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey } from "@/services/api-key.service";
import { parsePageParams, pageMeta } from "@/lib/api-pagination";

/** List questionnaires (paged), optional status filter (analysis v03 §4). */
export const GET = withApiKey(
  async (request: NextRequest) => {
    const { searchParams } = request.nextUrl;
    const { page, pageSize, skip, take } = parsePageParams(searchParams);
    const statusParam = searchParams.get("status");
    const status =
      statusParam === "DRAFT" || statusParam === "ACTIVE" || statusParam === "CLOSED"
        ? (statusParam as "DRAFT" | "ACTIVE" | "CLOSED")
        : null;

    const where = status ? { status } : {};

    const [items, total] = await Promise.all([
      db.questionnaire.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        select: {
          id: true,
          title: true,
          description: true,
          slug: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { questions: true, responses: true } },
        },
      }),
      db.questionnaire.count({ where }),
    ]);

    return Response.json({ data: items, meta: pageMeta(page, pageSize, total) });
  },
  "questionnaires:read"
);
