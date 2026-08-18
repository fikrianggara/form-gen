import { NextRequest } from "next/server";
import { getResponseDetail } from "@/services/response.service";
import { withApiKey } from "@/services/api-key.service";
import { NotFoundError } from "@/lib/errors";

/** Response detail with answers (analysis v03 §4). */
export const GET = withApiKey(
  async (_request: NextRequest, { params }: { params: Record<string, string> }) => {
    const response = await getResponseDetail(params.id);
    if (!response) throw new NotFoundError("Response not found");
    return Response.json({ data: response });
  },
  "responses:read"
);
