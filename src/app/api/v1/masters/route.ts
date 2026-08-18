import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey } from "@/services/api-key.service";
import { parsePageParams, pageMeta } from "@/lib/api-pagination";

/** List question masters (paged) — public + own-org visibility (analysis v03 §4). */
export const GET = withApiKey(
  async (request: NextRequest) => {
    const { searchParams } = request.nextUrl;
    const { page, pageSize, skip, take } = parsePageParams(searchParams);

    const [items, total] = await Promise.all([
      db.questionMaster.findMany({
        where: { isLatest: true },
        orderBy: { code: "asc" },
        skip,
        take,
        include: {
          optionSet: { include: { options: { orderBy: { order: "asc" } } } },
        },
      }),
      db.questionMaster.count({ where: { isLatest: true } }),
    ]);

    return Response.json({ data: items, meta: pageMeta(page, pageSize, total) });
  },
  "masters:read"
);
