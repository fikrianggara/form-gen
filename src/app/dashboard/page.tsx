import Link from "next/link";
import { listQuestionnaires } from "@/services/questionnaire.service";
import NewQuestionnaireForm from "@/components/dashboard/NewQuestionnaireForm";
import DuplicateQuestionnaireButton from "@/components/dashboard/DuplicateQuestionnaireButton";
import DeleteQuestionnaireButton from "@/components/dashboard/DeleteQuestionnaireButton";
import { Badge } from "@/components/ui";
import { IconPlus, IconBolt, IconEye, IconList, IconChart, IconPencil } from "@/components/icons";

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
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/generate"
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
          >
            <IconBolt size={16} />
            Generate with AI
          </Link>
          <Link
            href="/dashboard/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <IconPlus size={16} />
            New
          </Link>
        </div>
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
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-gray-900">{q.title}</h2>
                      <Badge tone={STATUS_TONE[q.status]}>{q.status}</Badge>
                      {!q.acceptMultipleResponses && (
                        <Badge tone="indigo" className="text-[10px]">
                          single response
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      /f/{q.slug} · {q._count.questions} questions · {q._count.responses} responses
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Link
                      href={`/f/${q.slug}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                    >
                      <IconEye size={14} />
                      View
                    </Link>
                    <Link
                      href={`/dashboard/questionnaires/${q.id}/responses`}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                    >
                      <IconList size={14} />
                      Responses
                    </Link>
                    <DuplicateQuestionnaireButton questionnaireId={q.id} />
                    <Link
                      href={`/dashboard/questionnaires/${q.id}/report`}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                    >
                      <IconChart size={14} />
                      Report
                    </Link>
                    <Link
                      href={`/dashboard/questionnaires/${q.id}/edit`}
                      className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                    >
                      <IconPencil size={14} />
                      Edit
                    </Link>
                    <DeleteQuestionnaireButton questionnaireId={q.id} title={q.title} />
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
