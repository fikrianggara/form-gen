"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  setSurveyQuestionnairesAction,
  disconnectSurveyQuestionnaireAction,
  deleteSurveyAction,
} from "@/lib/actions/org";
import { Badge, Button, Card } from "@/components/ui";
import { useToast } from "@/components/toast";

export function SurveyPanel({
  survey,
  questionnaires,
  connectable,
}: {
  survey: {
    id: string;
    name: string;
    description: string | null;
    organizationId: string;
    organizationName: string;
  };
  questionnaires: Array<{ id: string; title: string; slug: string; status: string }>;
  connectable: Array<{ id: string; title: string; slug: string }>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Set<string>>(
    () => new Set(questionnaires.map((q) => q.id))
  );

  const notYetConnected = useMemo(
    () => connectable.filter((q) => !selection.has(q.id)),
    [connectable, selection]
  );

  const run = (
    fn: () => Promise<{ error?: string }>,
    success: string,
    after?: () => void
  ) => {
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (res.error) {
        setError(res.error);
        toast.error("Action failed", res.error);
      } else {
        toast.success(success);
        router.refresh();
        after?.();
      }
    });
  };

  const saveSelection = () => {
    const ids = Array.from(selection);
    run(
      () =>
        setSurveyQuestionnairesAction({
          surveyId: survey.id,
          questionnaireIds: ids,
        }),
      "Questionnaire connections updated"
    );
  };

  const disconnect = (questionnaireId: string) => {
    run(
      () =>
        disconnectSurveyQuestionnaireAction({
          surveyId: survey.id,
          questionnaireId,
        }),
      "Questionnaire disconnected"
    );
  };

  const remove = () => {
    if (!confirm(`Delete survey "${survey.name}"? The questionnaires stay, only the survey goes.`)) return;
    run(
      () => deleteSurveyAction({ surveyId: survey.id }),
      "Survey deleted",
      () => router.push("/admin/orgs")
    );
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{survey.name}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {survey.description || "No description"} · {survey.organizationName}
          </p>
        </div>
        <Button variant="danger" onClick={remove} disabled={pending}>
          Delete survey
        </Button>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
      )}

      <Card className="p-6">
        <h2 className="mb-3 font-semibold">
          Connected questionnaires ({questionnaires.length})
        </h2>
        {questionnaires.length === 0 ? (
          <p className="text-sm text-gray-500">No questionnaires connected yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {questionnaires.map((q) => (
              <li key={q.id} className="flex items-center justify-between gap-3 py-2.5">
                <div>
                  <p className="font-medium text-gray-800">{q.title}</p>
                  <code className="text-xs text-gray-500">{q.slug}</code>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="gray">{q.status}</Badge>
                  <Button
                    variant="ghost"
                    disabled={pending}
                    onClick={() => disconnect(q.id)}
                  >
                    Disconnect
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="mb-1 font-semibold">Connect questionnaires</h2>
        <p className="mb-3 text-sm text-gray-500">
          Tick the questionnaires this survey should include, then save. Saving
          replaces the current connection set.
        </p>
        <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-3">
          {connectable.length === 0 ? (
            <p className="text-sm text-gray-500">Nothing left to connect.</p>
          ) : (
            connectable.map((q) => (
              <label
                key={q.id}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={selection.has(q.id)}
                  onChange={(e) => {
                    const next = new Set(selection);
                    if (e.target.checked) next.add(q.id);
                    else next.delete(q.id);
                    setSelection(next);
                  }}
                  className="accent-indigo-600"
                />
                <span className="text-sm text-gray-700">{q.title}</span>
                <code className="text-xs text-gray-400">{q.slug}</code>
              </label>
            ))
          )}
        </div>
        <div className="mt-3 flex justify-end">
          <Button onClick={saveSelection} disabled={pending}>
            Save connections
          </Button>
        </div>
        {notYetConnected.length === 0 && questionnaires.length > 0 && (
          <p className="mt-2 text-right text-xs text-gray-400">
            Every connectable questionnaire is already connected.
          </p>
        )}
      </Card>
    </div>
  );
}
