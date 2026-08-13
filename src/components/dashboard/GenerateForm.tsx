"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { generateQuestionnaireAction } from "@/lib/actions/dashboard";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { useToast } from "@/components/toast";

export default function GenerateForm({ hybridActive }: { hybridActive: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [maxQuestions, setMaxQuestions] = useState(10);
  const [threshold, setThreshold] = useState(0.3);
  const [multiple, setMultiple] = useState(true);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-2 text-2xl font-bold">Generate questionnaire with AI</h1>
      <p className="mb-6 text-sm text-gray-500">
        Describe the questionnaire, its questions and question descriptions. The system
        retrieves matching questions from the question bank, predicts the title and
        description, and creates a draft questionnaire — flagging low-confidence matches.
      </p>

      <Card className="p-6">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            setError(null);
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
            toast.success(
              "Questionnaire generated",
              `${result.matchCount} question${result.matchCount === 1 ? "" : "s"} suggested from the question bank.`
            );
            router.push(
              `/dashboard/questionnaires/${result.questionnaireId}/edit?generated=1&matches=${result.matchCount}&low=${result.lowCount}`
            );
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
