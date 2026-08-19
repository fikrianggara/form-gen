import fs from "node:fs";
import path from "node:path";

/** Serve the OpenAPI spec as an HTTP resource (TKT-046). No auth — docs. */
export async function GET() {
  const specPath = path.join(process.cwd(), "docs", "openapi.yaml");
  const spec = fs.readFileSync(specPath, "utf8");
  return new Response(spec, {
    headers: {
      "Content-Type": "text/yaml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
