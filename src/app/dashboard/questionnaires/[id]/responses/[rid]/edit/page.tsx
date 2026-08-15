import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/http";
import { requirePermission } from "@/lib/auth/rbac";
import { assertCanManageQuestionnaire } from "@/services/access-control.service";
import { getResponseDetail, getQuestionnaireConfig } from "@/services/response.service";
import { ResponseEditForm } from "@/components/dashboard/ResponseEditForm";

export const dynamic = "force-dynamic";

export default async function EditResponsePage({
  params,
}: {
  params: { id: string; rid: string };
}) {
  const session = await getSession();
  requirePermission(session, "MANAGE_QUESTIONNAIRES");
  await assertCanManageQuestionnaire(session, params.id);

  const questionnaire = await db.questionnaire.findUnique({
    where: { id: params.id },
    select: { id: true, title: true, slug: true },
  });
  if (!questionnaire) notFound();

  const [detail, config] = await Promise.all([
    getResponseDetail(params.rid),
    getQuestionnaireConfig(questionnaire.slug),
  ]);
  if (!detail || !config) notFound();
  if (detail.questionnaireId !== params.id) notFound();

  // Keep the action payload size sane: the client form posts back the
  // answer inputs; we only need the response's id + questionnaire here.
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Edit response</h1>
          <p className="text-sm text-gray-500">
            {questionnaire.title} · {detail.respondentLabel ?? "Anonymous"}
          </p>
        </div>
        <Link
          href={`/dashboard/questionnaires/${params.id}/responses/${params.rid}`}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
        >
          ← Back to detail
        </Link>
      </div>

      <ResponseEditForm
        questionnaireId={params.id}
        responseId={params.rid}
        config={config}
        detail={detail}
      />
    </div>
  );
}
