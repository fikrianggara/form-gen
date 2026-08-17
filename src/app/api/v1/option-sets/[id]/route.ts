import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey } from "@/services/api-key.service";
import { NotFoundError } from "@/lib/errors";

/** Option set detail incl. options (analysis v03 §4). */
export const GET = withApiKey(
  async (_request: NextRequest, { params }: { params: Record<string, string> }) => {
    const optionSet = await db.optionSet.findUnique({
      where: { id: params.id },
      include: { options: { orderBy: { order: "asc" } } },
    });
    if (!optionSet) throw new NotFoundError("Option set not found");
    return Response.json({ data: optionSet });
  },
  "option-sets:read"
);
