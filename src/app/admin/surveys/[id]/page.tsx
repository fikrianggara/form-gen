import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/http";
import { requirePermission } from "@/lib/auth/rbac";
import {
  getSurveyWithQuestionnaires,
  listConnectableQuestionnaires,
} from "@/services/org.service";
import { SurveyPanel } from "@/components/admin/SurveyPanel";

export const dynamic = "force-dynamic";

export default async function SurveyDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  requirePermission(session, "MANAGE_QUESTIONNAIRES");

  let survey;
  try {
    survey = await getSurveyWithQuestionnaires(params.id);
  } catch {
    notFound();
  }
  if (session.role !== "ADMIN" && survey.organizationId !== session.organizationId) {
    notFound();
  }

  const connectable = await listConnectableQuestionnaires(session);

  return (
    <SurveyPanel
      survey={{
        id: survey.id,
        name: survey.name,
        description: survey.description,
        organizationId: survey.organizationId,
        organizationName: survey.organization?.name ?? "—",
      }}
      questionnaires={survey.questionnaires.map((sq) => ({
        id: sq.questionnaire.id,
        title: sq.questionnaire.title,
        slug: sq.questionnaire.slug,
        status: sq.questionnaire.status,
      }))}
      connectable={connectable.map((q) => ({ id: q.id, title: q.title, slug: q.slug }))}
    />
  );
}
