import Link from "next/link";
import { listQuestionnaires } from "@/services/questionnaire.service";
import NewQuestionnaireForm from "@/components/dashboard/NewQuestionnaireForm";
import { Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "gray" | "green" | "amber"> = {
  DRAFT: "gray",
  ACTIVE: "green",
  CLOSED: "amber",
};

export default async function DashboardPage() {
  const questionnaires = await listQuestionnaires();

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Questionnaires</h1>
        <Link
          href="/dashboard/new"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          + New
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {questionnaires.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">
              No questionnaires yet. Create your first one.
            </p>
          ) : (
            questionnaires.map((q) => (
              <div key={q.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold text-gray-900">{q.title}</h2>
                      <Badge tone={STATUS_TONE[q.status]}>{q.status}</Badge>
                      {!q.acceptMultipleResponses && (
                        <Badge tone="indigo">single response</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      /f/{q.slug} · {q._count.questions} questions · {q._count.responses} responses
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Link
                      href={`/f/${q.slug}`}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                    >
                      View
                    </Link>
                    <Link
                      href={`/dashboard/questionnaires/${q.id}/responses`}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                    >
                      Responses
                    </Link>
                    <Link
                      href={`/dashboard/questionnaires/${q.id}/edit`}
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                    >
                      Edit
                    </Link>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        <NewQuestionnaireForm />
      </div>
    </div>
  );
}
