import Link from "next/link";
import { notFound } from "next/navigation";
import { getResponseDetail } from "@/services/response.service";
import { Badge, Card } from "@/components/ui";
import { extractAnswerValue } from "@/domain/answers";
import type { QuestionType } from "@prisma/client";

export const dynamic = "force-dynamic";

function renderValue(type: QuestionType, answer: {
  textValue: string | null;
  numberValue: number | null;
  dateValue: Date | null;
  jsonValue: unknown;
  isComputed: boolean;
}): string {
  if (answer.isComputed && answer.numberValue !== null) {
    return `${answer.numberValue} (computed)`;
  }
  const v = extractAnswerValue(type, answer as never);
  if (v === null) return "—";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

export default async function ResponseDetailPage({
  params,
}: {
  params: { id: string; rid: string };
}) {
  const detail = await getResponseDetail(params.rid);
  if (!detail) notFound();

  const byId = new Map(
    detail.answers
      .map((a) => a.question)
      .concat(detail.answerGroups.flatMap((g) => g.answers.map((a) => a.question)))
      .map((q) => [q.id, q])
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Response detail</h1>
          <p className="text-sm text-gray-500">
            {detail.questionnaire.title} · {detail.respondentLabel ?? "Anonymous"}
          </p>
        </div>
        <Link
          href={`/dashboard/questionnaires/${params.id}/responses`}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
        >
          ← All responses
        </Link>
      </div>

      <div className="flex gap-3">
        <Badge tone={detail.status === "COMPLETED" ? "green" : "gray"}>{detail.status}</Badge>
        <Badge tone="indigo">{detail.progress}% complete</Badge>
        {detail.completedAt && <Badge tone="green">Completed {detail.completedAt.toLocaleString()}</Badge>}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {detail.answers
          .filter((a) => !a.answerGroupId)
          .map((a) => (
            <Card key={a.id} className="p-5">
              <p className="text-xs font-medium uppercase text-gray-400">
                {a.question.questionMaster.code}
              </p>
              <p className="text-sm font-semibold text-gray-900">{a.question.questionMaster.title}</p>
              <p className="mt-2 text-sm text-gray-700">
                {renderValue(a.question.questionMaster.questionType, a)}
              </p>
            </Card>
          ))}
      </div>

      {detail.answerGroups.length > 0 && (
        <div className="space-y-4">
          <h2 className="font-semibold">Repeatable groups</h2>
          {detail.answerGroups.map((group) => (
            <Card key={group.id} className="p-5">
              <p className="mb-3 text-xs font-medium text-gray-500">
                {group.question.questionMaster.title} — row {group.rowIndex + 1}
              </p>
              <dl className="grid gap-2 sm:grid-cols-2">
                {group.answers.map((a) => (
                  <div key={a.id}>
                    <dt className="text-xs text-gray-400">{a.question.questionMaster.title}</dt>
                    <dd className="text-sm text-gray-800">
                      {renderValue(a.question.questionMaster.questionType, a)}
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>
          ))}
        </div>
      )}

      {byId.size === 0 && <p className="text-sm text-gray-500">No answers recorded.</p>}
    </div>
  );
}
