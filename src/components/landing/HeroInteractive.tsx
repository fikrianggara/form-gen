"use client";

import { useState } from "react";
import Link from "next/link";

/** A miniature form-field mock used inside the hero product card. */
function Field({
  label,
  kind,
  children,
}: {
  label: string;
  kind: "input" | "choice" | "computed" | "repeat";
  children?: React.ReactNode;
}) {
  const chip: Record<string, string> = {
    input: "bg-slate-100 text-slate-500",
    choice: "bg-indigo-50 text-indigo-700",
    computed: "bg-amber-50 text-amber-700",
    repeat: "bg-emerald-50 text-emerald-700",
  };
  const chipLabel: Record<string, string> = {
    input: "text",
    choice: "single choice",
    computed: "computed",
    repeat: "repeatable",
  };
  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-900/60 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-200">{label}</span>
        <span
          className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${chip[kind]}`}
        >
          {chipLabel[kind]}
        </span>
      </div>
      {children}
    </div>
  );
}

const AI_PIPELINE = [
  { step: "Prompt", detail: "Describe the survey in plain language" },
  { step: "Retrieve", detail: "Hybrid search over the question bank" },
  { step: "Compose", detail: "Title, description, matching questions" },
  { step: "Flag", detail: "Low-confidence & novel question ideas" },
];

export function HeroInteractive() {
  const [aiTop, setAiTop] = useState(false);

  return (
    <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-6 pb-24 pt-16 lg:grid-cols-2 lg:pt-24">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-indigo-400">
          Questionnaire engine · Conditional logic · AI generation
        </p>
        <h1 className="mt-5 text-4xl font-bold leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-6xl">
          Forms that think.
          <br />
          <span className="text-indigo-400">Answers that add up.</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-300">
          FormGen builds questionnaires with conditional rules, repeatable
          groups, and computed totals — then runs them for organizations,
          gathers responses, and hands the data to your systems over a
          documented REST API.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Link
            href="/dashboard"
            className="rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 transition-colors hover:bg-indigo-500"
          >
            Start building →
          </Link>
          <a
            href="#how-it-works"
            className="rounded-xl border border-slate-700 px-6 py-3 text-sm font-medium text-slate-200 transition-colors hover:border-slate-500 hover:text-white"
          >
            See how it works
          </a>
          {/* AI trigger — hovering brings the AI card to the top */}
          <button
            type="button"
            onMouseEnter={() => setAiTop(true)}
            onMouseLeave={() => setAiTop(false)}
            onFocus={() => setAiTop(true)}
            onBlur={() => setAiTop(false)}
            className="rounded-xl bg-indigo-500/15 px-6 py-3 font-mono text-sm font-semibold text-indigo-300 ring-1 ring-inset ring-indigo-400/40 transition-colors hover:bg-indigo-500/25 hover:text-indigo-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400"
            aria-pressed={aiTop}
          >
            ✦ Try AI generation
          </button>
        </div>
        <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-slate-800 pt-8">
          {[
            ["Conditional rules", "skip logic that adapts as people answer"],
            ["Computed totals", "auto-calculated fields, no scripting"],
            ["Open API", "scoped read access for your systems"],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-sm font-semibold text-white">{k}</dt>
              <dd className="mt-1 text-xs leading-relaxed text-slate-400">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* stacked cards: questionnaire base + AI card overlapping on top */}
      <div className="relative">
        <div
          aria-hidden
          className="absolute -inset-6 rounded-3xl bg-indigo-500/20 blur-3xl"
        />
        {/* questionnaire product card (base) */}
        <div
          className={`relative rounded-2xl border border-slate-700/70 bg-slate-900/80 p-5 shadow-2xl backdrop-blur transition-all duration-300 ${
            aiTop ? "scale-[0.985] opacity-60" : "opacity-100"
          }`}
        >
          <div className="mb-4 flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <p className="text-sm font-semibold text-white">BPS Annual Survey</p>
              <p className="font-mono text-[11px] text-slate-500">status: ACTIVE</p>
            </div>
            <span className="rounded-full bg-emerald-500/15 px-3 py-1 font-mono text-[11px] font-medium text-emerald-400">
              ● live
            </span>
          </div>
          <div className="space-y-3">
            <Field label="Business sector" kind="choice">
              <div className="flex flex-wrap gap-2">
                {["Agriculture", "Industry", "Services"].map((o) => (
                  <span
                    key={o}
                    className="rounded-lg border border-indigo-400/40 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300"
                  >
                    {o}
                  </span>
                ))}
              </div>
            </Field>
            <div className="flex items-center gap-2 font-mono text-[11px] text-slate-500">
              <span className="text-indigo-400">if</span> sector = Industry
              <span className="text-slate-600">→</span>
              <span className="text-slate-300">show #2</span>
            </div>
            <Field label="Monthly production value (IDR)" kind="computed">
              <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-right font-mono text-sm text-amber-300">
                = Σ line items
              </div>
            </Field>
            <Field label="Production line items" kind="repeat">
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-lg bg-slate-800/80 px-3 py-2">
                  <span className="text-xs text-slate-300">Item 1 · 4.200.000</span>
                  <span className="font-mono text-[10px] text-slate-500">+ add</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-dashed border-slate-700 px-3 py-2">
                  <span className="text-xs text-slate-500">Item 2 · 1.800.000</span>
                  <span className="font-mono text-[10px] text-emerald-400">repeatable</span>
                </div>
              </div>
            </Field>
          </div>
        </div>

        {/* AI generation card — overlaps, brought to top on hover */}
        <div
          className={`absolute -bottom-10 -right-4 w-[88%] rounded-2xl border bg-slate-900/95 p-5 shadow-2xl backdrop-blur transition-all duration-300 sm:-right-6 ${
            aiTop
              ? "z-20 translate-x-0 translate-y-0 border-indigo-400/60 opacity-100"
              : "z-10 translate-x-3 translate-y-2 border-slate-700/70 opacity-95"
          }`}
          onMouseEnter={() => setAiTop(true)}
          onMouseLeave={() => setAiTop(false)}
        >
          <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-3">
            <span className="font-mono text-xs text-slate-500">generate</span>
            <span className="rounded-full bg-indigo-500/15 px-3 py-1 font-mono text-[11px] font-medium text-indigo-400">
              ✦ AI · hybrid RAG
            </span>
          </div>
          <div className="mb-4 rounded-lg border border-slate-700/70 bg-slate-800/50 px-3 py-2 font-mono text-xs text-slate-400">
            <span className="text-indigo-400">prompt</span> Annual production
            survey for manufacturing …
          </div>
          <ol className="space-y-2">
            {AI_PIPELINE.map((p, i) => (
              <li
                key={p.step}
                className="flex items-center gap-3 rounded-lg bg-slate-800/60 px-3 py-2"
              >
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-indigo-600/20 font-mono text-[11px] font-bold text-indigo-400">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-200">{p.step}</div>
                  <div className="truncate text-[11px] text-slate-500">{p.detail}</div>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-4 rounded-lg border border-dashed border-slate-700 px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-500">
            <span className="text-emerald-400">✓</span> 8 questions from bank ·{" "}
            <span className="text-amber-400">2 flagged</span> ·{" "}
            <span className="text-indigo-400">1 novel</span>
          </div>
          <div className="mt-4 text-right">
            <Link
              href="/dashboard/generate"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-500"
            >
              Try AI generation →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
