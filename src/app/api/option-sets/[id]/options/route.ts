import { NextRequest } from "next/server";
import { getOptionSetOptions } from "@/services/option-proxy.service";
import { jsonOk, jsonError } from "@/lib/http";

interface Params {
  params: { id: string };
}

/**
 * Option list for a choice question.
 * STATIC sets return stored options; EXTERNAL_API sets are proxied
 * server-side so the browser never touches the upstream API directly.
 * `?fresh=1` bypasses the proxy cache (used by the admin "Test" button).
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const fresh = req.nextUrl.searchParams.get("fresh") === "1";
    const result = await getOptionSetOptions(params.id, { fresh });
    return jsonOk(result);
  } catch (err) {
    return jsonError(err);
  }
}
