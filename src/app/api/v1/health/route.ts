import { withPublicLog } from "@/services/api-key.service";

/** Public liveness probe — no auth, logged as anonymous (analysis v03 §4). */
export const GET = withPublicLog(async () => {
  return Response.json(
    {
      data: {
        status: "ok",
        service: "form-gen-api",
        version: "v1",
        time: new Date().toISOString(),
      },
    },
    { status: 200 }
  );
});
