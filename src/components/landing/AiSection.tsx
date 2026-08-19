import Link from "next/link";

const PIPELINE = [
  {
    step: "Prompt",
    detail: "Describe the survey in plain language",
  },
  {
    step: "Retrieve",
    detail: "Hybrid search over the question bank (text + embeddings)",
  },
  {
    step: "Compose",
    detail: "Title, description, and matching questions",
  },
  {
    step: "Flag",
    detail: "Low-confidence matches & brand-new question ideas",
  },
];

export function AiSection() {
  return (
    <section id="ai" className="bg-[#0b1220] text-slate-100">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-24 lg:grid-cols-2">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-indigo-400">
            AI generation · Hybrid RAG
          </p>
          <h2 className="mt-4 text-4xl font-semibold tracking-tight text-white">
            Describe the survey.
            <br />
            <span className="text-indigo-400">It builds itself.</span>
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-slate-300">
            Type a plain-language prompt and FormGen retrieves matching
            questions from your question bank, predicts a title and
            description, and drafts a questionnaire — flagging low-confidence
            matches and proposing new questions the bank doesn&apos;t cover yet.
          </p>
          <div className="mt-8">
            <Link
              href="/dashboard/generate"
              className="rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 transition-colors hover:bg-indigo-500"
            >
              Try AI generation →
            </Link>
          </div>
        </div>

        {/* pipeline mock */}
        <div className="rounded-2xl border border-slate-700/70 bg-slate-900/80 p-6">
          <div className="mb-4 flex items-center justify-between border-b border-slate-800 pb-3">
            <span className="font-mono text-xs text-slate-500">generate</span>
            <span className="rounded-full bg-indigo-500/15 px-3 py-1 font-mono text-[11px] font-medium text-indigo-400">
              rag
            </span>
          </div>
          <div className="mb-5 rounded-lg border border-slate-700/70 bg-slate-800/50 px-3 py-2 font-mono text-xs text-slate-400">
            <span className="text-indigo-400">prompt</span> Annual production
            survey for manufacturing …
          </div>
          <ol className="space-y-3">
            {PIPELINE.map((p, i) => (
              <li
                key={p.step}
                className="flex items-center gap-3 rounded-lg bg-slate-800/60 px-3 py-2.5"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-indigo-600/20 font-mono text-xs font-bold text-indigo-400">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-200">{p.step}</div>
                  <div className="truncate text-xs text-slate-500">{p.detail}</div>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-5 rounded-lg border border-dashed border-slate-700 px-3 py-3 font-mono text-[11px] leading-relaxed text-slate-500">
            <span className="text-emerald-400">✓</span> 8 questions from bank ·{" "}
            <span className="text-amber-400">2 flagged</span> ·{" "}
            <span className="text-indigo-400">1 novel</span>
          </div>
        </div>
      </div>
    </section>
  );
}
