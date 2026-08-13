import { NextRequest, NextResponse } from "next/server";
import { getSession, jsonError } from "@/lib/http";
import { requireAuth } from "@/lib/auth/rbac";
import { NotFoundError } from "@/lib/errors";
import { getExportPayload } from "@/services/report.service";
import { buildWorkbookBuffer } from "@/services/excel.service";

export const dynamic = "force-dynamic";

/**
 * Export all responses for a questionnaire.
 *   GET /api/questionnaires/[slug]/export            -> JSON (API export)
 *   GET /api/questionnaires/[slug]/export?format=xlsx -> .xlsx download
 * Requires an authenticated dashboard session (any role can view responses).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const session = await getSession();
    requireAuth(session);

    const payload = await getExportPayload(params.slug);
    if (!payload) throw new NotFoundError("Questionnaire not found");

    if (req.nextUrl.searchParams.get("format") === "xlsx") {
      const buffer = await buildWorkbookBuffer(payload);
      const date = new Date().toISOString().slice(0, 10);
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${payload.questionnaire.slug}-responses-${date}.xlsx"`,
        },
      });
    }

    return NextResponse.json(payload);
  } catch (err) {
    return jsonError(err);
  }
}
