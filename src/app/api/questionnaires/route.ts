import { db } from "@/lib/db";
import { jsonOk } from "@/lib/http";

/** Public landing: list active questionnaires. */
export async function GET() {
  const questionnaires = await db.questionnaire.findMany({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    select: {
      slug: true,
      title: true,
      description: true,
      _count: { select: { questions: true } },
    },
  });
  return jsonOk({ questionnaires });
}
