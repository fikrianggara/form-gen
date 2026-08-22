"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  generateQuestionnaireAction,
  addNovelMasterAction,
  type NovelMasterSuggestion,
} from "@/lib/actions/dashboard";
import { Badge, Button, Card, Field, inputClass } from "@/components/ui";
import { useToast } from "@/components/toast";

export default function GenerateForm({
  hybridActive,
  creditsRemaining,
}: {
  hybridActive: boolean;
  /** TKT-069: today's remaining AI credits (server-fetched; null = not signed in). */
  creditsRemaining: number | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // TKT-069: live balance — starts from the server value, updated after each generation.
  const [balance, setBalance] = useState<number | null>(creditsRemaining);
  const [maxQuestions, setMaxQuestions] = useState(10);
  const [threshold, setThreshold] = useState(0.3);
  const [multiple, setMultiple] = useState(true);
  // TKT-008: generation result — novel questions flagged, per-question add-to-master.
  const [novel, setNovel] = useState<NovelMasterSuggestion[]>([]);
  const [added, setAdded] = useState<Set<number>>(new Set());
  const [modalIdx, setModalIdx] = useState<number | null>(null);
  const [savingMaster, startMasterSave] = useTransition();
  const [result, setResult] = useState<{
    questionnaireId: string;
    matchCount: number;
    lowCount: number;
  } | null>(null);

  const closeModal = () => setModalIdx(null);

  const addToMaster = (idx: number) => {
    const item = novel[idx];
    if (!item) return;
    startMasterSave(async () => {
      const res = await addNovelMasterAction(item);
      if (res.error) {
        toast.error("Could not add question", res.error);
        return;
      }
      setAdded((prev) => new Set(prev).add(idx));
      closeModal();
      toast.success("Added to question master", "Saved as PENDING — an admin must publish it before it enters the shared bank.");
    });
  };

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-2 text-2xl font-bold">Generate questionnaire with AI</h1>
      <p className="mb-6 text-sm text-gray-500">
        Describe the questionnaire, its questions and question descriptions. The system
        retrieves matching questions from the question bank, predicts the title and
        description, and creates a draft questionnaire — flagging low-confidence matches
        and any novel questions not in the bank.
      </p>

      {balance !== null && (
        <div className="mb-6 flex items-center justify-between rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3">
          <div className="text-sm">
            <span className="font-medium text-indigo-900">AI credits today</span>
            <span className="text-indigo-600"> · 5 per questionnaire generation</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className={`text-xl font-bold ${balance <= 0 ? "text-red-600" : "text-indigo-900"}`}>
              {balance}
            </span>
            <span className="text-xs text-indigo-500">remaining</span>
          </div>
        </div>
      )}

      <Card className="p-6">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            setError(null);
            setNovel([]);
            setAdded(new Set());
            const fd = new FormData(e.currentTarget);
            const result = await generateQuestionnaireAction({
              prompt: String(fd.get("prompt") ?? ""),
              maxQuestions: Number(fd.get("maxQuestions") ?? 10),
              threshold: Number(fd.get("threshold") ?? 0.3),
              acceptMultipleResponses: fd.get("multiple") === "on",
            });
            if (result.error) {
              setError(result.error);
              toast.error("Could not generate questionnaire", result.error);
              setPending(false);
              return;
            }
            setNovel(result.novel ?? []);
            setResult({
              questionnaireId: result.questionnaireId!,
              matchCount: result.matchCount ?? 0,
              lowCount: result.lowCount ?? 0,
            });
            if (result.creditsRemaining !== undefined) {
              setBalance(result.creditsRemaining);
            }
            toast.success(
              "Questionnaire generated",
              `${result.matchCount} question${result.matchCount === 1 ? "" : "s"} suggested from the question bank${(result.novel?.length ?? 0) > 0 ? `, ${result.novel!.length} new question${result.novel!.length === 1 ? "" : "s"} flagged.` : "."}`
            );
            setPending(false);
          }}
        >
          <Field
            label="Prompt"
            required
            hint="Describe the questionnaire and its questions, e.g.: Customer onboarding survey. Ask for their full name, email address and age, plus how satisfied they are."
          >
            <textarea
              name="prompt"
              required
              rows={7}
              className={inputClass}
              placeholder={"What should the questionnaire cover?\n\nExample:\nCustomer onboarding survey.\nWhat is your full name?\nWhat is your email address?\nHow old are you?\nRate your overall satisfaction."}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Max questions" hint="1–30">
              <input
                name="maxQuestions"
                type="number"
                min={1}
                max={30}
                value={maxQuestions}
                onChange={(e) => setMaxQuestions(Number(e.target.value))}
                className={inputClass}
              />
            </Field>
            <Field label="Low-confidence threshold" hint="0–1 (higher = stricter)">
              <input
                name="threshold"
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className={inputClass}
              />
            </Field>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  name="multiple"
                  checked={multiple}
                  onChange={(e) => setMultiple(e.target.checked)}
                  className="accent-indigo-600"
                />
                Allow multiple responses
              </label>
            </div>
          </div>

          {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? "Retrieving questions…" : "Generate questionnaire"}
            </Button>
          </div>
        </form>
      </Card>

      {/* TKT-008: generation success — open the draft, review novel questions */}
      {result && (
        <Card className="mt-6 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold">Draft questionnaire created</h2>
              <p className="mt-1 text-sm text-gray-500">
                {result.matchCount} question{result.matchCount === 1 ? "" : "s"} matched
                from the bank
                {result.lowCount > 0 ? ` (${result.lowCount} low-confidence)` : ""}.
                {novel.length > 0
                  ? ` ${novel.length} new question${novel.length === 1 ? "" : "s"} flagged below.`
                  : ""}
              </p>
            </div>
            <Button type="button" onClick={() => router.push(`/dashboard/questionnaires/${result.questionnaireId}/edit?generated=1&matches=${result.matchCount}&low=${result.lowCount}`)}>
              Open questionnaire →
            </Button>
          </div>
        </Card>
      )}

      {/* TKT-008: novel (unmatched) questions flagged after generation */}
      {novel.length > 0 && (
        <Card className="mt-6 p-6">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="font-semibold">New questions not in the bank</h2>
            <Badge tone="amber">{novel.length}</Badge>
          </div>
          <p className="mb-4 text-sm text-gray-500">
            These questions have no match in the question master bank. Add one to the
            master as a <span className="font-medium">PENDING</span> suggestion — an
            admin validates and publishes it before it becomes visible to everyone.
          </p>
          <ul className="space-y-2">
            {novel.map((n, idx) => (
              <li
                key={`${n.title}-${idx}`}
                className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">{n.title}</p>
                  <p className="text-xs text-gray-400">
                    <Badge tone="gray" className="mr-1">{n.questionType}</Badge>
                    {n.description ? `— ${n.description}` : ""}
                  </p>
                </div>
                {added.has(idx) ? (
                  <Badge tone="green">Added</Badge>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setModalIdx(idx)}
                  >
                    Add to master
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Add-to-master confirmation modal */}
      {modalIdx !== null && novel[modalIdx] && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-semibold">Add to question master?</h3>
            <p className="mb-4 text-sm text-gray-600">
              <span className="font-medium text-gray-900">{novel[modalIdx]!.title}</span> will
              be saved as a new question master with status{" "}
              <span className="font-medium">PENDING</span>. Only you and admins can see it
              until it is published.
            </p>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={closeModal} disabled={savingMaster}>
                Cancel
              </Button>
              <Button type="button" onClick={() => addToMaster(modalIdx)} disabled={savingMaster}>
                {savingMaster ? "Saving…" : "Add to master"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <p className="mt-4 text-xs text-gray-400">
        {hybridActive ? (
          <>
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500 align-middle" />
            Semantic retrieval active — pgvector embeddings (cosine) blended with lexical
            trigram similarity.
          </>
        ) : (
          <>
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-400 align-middle" />
            Lexical retrieval only (pg_trgm). Configure LLM_EMBEDDING_API_KEY + run
            <code className="mx-1 rounded bg-gray-100 px-1">npm run db:embed</code>
            to enable semantic search.
          </>
        )}
      </p>
    </div>
  );
}
