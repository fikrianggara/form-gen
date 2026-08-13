import Link from "next/link";
import { notFound } from "next/navigation";
import { getQuestionnaireReport } from "@/services/report.service";
import type { QuestionStat } from "@/services/report.service";
import { Badge, Card, ProgressBar } from "@/components/ui";
import type { QuestionType } from "@prisma/client";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<QuestionType, string> = {
  TEXT: "Text",
  TEXTAREA: "Textarea",
  NUMBER: "Number",
  DATE: "Date",
  RADIO: "Radio",
  CHECKBOX: "Checkbox",
  SELECT: "Select",
  RATING: "Rating",
};

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(n);
}

function fmtDate(d: string): string {
  const date = new Date(`${d}T00:00:00Z`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default async function ReportPage({
  params,
}: {
  params: { id: string };
}) {
  const report = await getQuestionnaireReport(params.id);
  if (!report) notFound();

  const { totals, daily, questions } = report;
  const maxDaily = Math.max(1, ...daily.map((d) => d.count));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Report</h1>
          <p className="text-sm text-gray-500">
            {report.questionnaire.title} ·{" "}
            <Link
              href={`/f/${report.questionnaire.slug}`}
              className="underline"
            >
              /f/{report.questionnaire.slug}
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/questionnaires/${report.questionnaire.slug}/export?format=json`}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            Export API
          </a>
          <a
            href={`/api/questionnaires/${report.questionnaire.slug}/export?format=xlsx`}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Export Excel
          </a>
          <Link
            href={`/dashboard/questionnaires/${params.id}/responses`}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            ← Responses
          </Link>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5">
          <p className="text-xs font-medium uppercase text-gray-400">Total responses</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{totals.total}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase text-gray-400">Completed</p>
          <p className="mt-1 text-3xl font-bold text-emerald-600">
            {totals.completed}
            <span className="ml-2 text-sm font-normal text-gray-500">
              {totals.drafts} draft{totals.drafts === 1 ? "" : "s"}
            </span>
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase text-gray-400">Completion rate</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{totals.completionRate}%</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase text-gray-400">Average progress</p>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1">
              <ProgressBar value={totals.averageProgress} />
            </div>
            <span className="text-sm font-semibold text-gray-700">
              {totals.averageProgress}%
            </span>
          </div>
        </Card>
      </div>

      {/* Daily volume */}
      <Card className="p-5">
        <h2 className="mb-4 font-semibold text-gray-900">Responses per day</h2>
        {totals.total === 0 ? (
          <p className="text-sm text-gray-500">No responses recorded yet.</p>
        ) : (
          <div className="flex h-32 items-end gap-1.5">
            {daily.map((d) => (
              <div key={d.date} className="group flex flex-1 flex-col items-center gap-1">
                <span className="text-[10px] text-gray-500 opacity-0 transition-opacity group-hover:opacity-100">
                  {d.count}
                </span>
                <div
                  className="w-full rounded-t bg-indigo-500 transition-colors group-hover:bg-indigo-600"
                  style={{ height: `${Math.max(2, (d.count / maxDaily) * 100)}%` }}
                  title={`${d.date}: ${d.count}`}
                />
                <span className="text-[10px] text-gray-400">{fmtDate(d.date)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Per-question statistics */}
      <div>
        <h2 className="mb-3 font-semibold text-gray-900">Question statistics</h2>
        {questions.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">
            This questionnaire has no questions yet.
          </p>
        ) : (
          <div className="space-y-4">
            {questions.map((q) => (
              <QuestionStatsCard key={q.questionId} stat={q} totalResponses={totals.total} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function QuestionStatsCard({
  stat,
  totalResponses,
}: {
  stat: QuestionStat;
  totalResponses: number;
}) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {stat.groupTitle && <Badge tone="indigo">{stat.groupTitle}</Badge>}
            <h3 className="font-semibold text-gray-900">{stat.title}</h3>
            <Badge tone="gray">{TYPE_LABEL[stat.questionType]}</Badge>
            {stat.required && <Badge tone="amber">required</Badge>}
            {stat.isAggregate && <Badge tone="green">computed</Badge>}
          </div>
          <p className="mt-0.5 text-xs text-gray-400">{stat.code}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-gray-800">
            {stat.answeredCount}
            <span className="font-normal text-gray-400"> / {totalResponses} answered</span>
          </p>
          <p className="text-xs text-gray-500">
            {stat.responseRate}% · {stat.rowCount} value{stat.rowCount === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {stat.numeric && (
        <dl className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-gray-50 p-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-gray-400">Average</dt>
            <dd className="font-semibold text-gray-900">{fmt(stat.numeric.avg)}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400">Min</dt>
            <dd className="font-semibold text-gray-900">{fmt(stat.numeric.min)}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400">Max</dt>
            <dd className="font-semibold text-gray-900">{fmt(stat.numeric.max)}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400">Sum</dt>
            <dd className="font-semibold text-gray-900">{fmt(stat.numeric.sum)}</dd>
          </div>
        </dl>
      )}

      {stat.distribution && stat.distribution.length > 0 && (
        <div className="mt-4 space-y-2">
          {stat.distribution.map((d) => (
            <div key={d.value} className="flex items-center gap-3">
              <span className="w-40 truncate text-sm text-gray-700" title={d.label}>
                {d.label}
              </span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-indigo-500"
                  style={{ width: `${Math.min(100, d.percent)}%` }}
                />
              </div>
              <span className="w-24 text-right text-xs text-gray-500">
                {d.count} · {d.percent}%
              </span>
            </div>
          ))}
        </div>
      )}

      {!stat.numeric && (!stat.distribution || stat.distribution.length === 0) && (
        <p className="mt-3 text-xs text-gray-400">
          No distribution to show for this question type.
        </p>
      )}
    </Card>
  );
}
