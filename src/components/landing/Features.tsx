const FEATURES = [
  {
    icon: "⇄",
    title: "Conditional logic",
    body: "Questions appear and disappear based on earlier answers — every visibility operator, ALL/ANY groups, no scripting required.",
  },
  {
    icon: "⋮⋮",
    title: "Repeatable groups",
    body: "Let respondents add multiple rows — production lines, household members, line items — each with its own nested questions.",
  },
  {
    icon: "Σ",
    title: "Computed questions",
    body: "Totals and aggregates computed on the fly from flat or repeatable answers. The number always matches the sum.",
  },
  {
    icon: "◫",
    title: "Surveys & organizations",
    body: "Organize questionnaires under surveys per organization. One questionnaire can feed multiple surveys with full access control.",
  },
  {
    icon: "📤",
    title: "Targeted distribution",
    body: "Invite respondents by email with unique per-person links. No accounts, no passwords — just a private link per questionnaire.",
  },
  {
    icon: "⇄",
    title: "Public REST API",
    body: "A documented, scoped, rate-limited API (v1) so your systems can read questionnaires, responses, and reports programmatically.",
  },
];

export function Features() {
  return (
    <section id="features" className="bg-white">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-indigo-700">
          Capabilities
        </p>
        <h2 className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight text-slate-900">
          Built for surveys that need to behave like software
        </h2>
        <p className="mt-4 max-w-2xl text-lg text-slate-600">
          A form engine, not just a form builder — every feature exists to
          keep data clean, structured, and ready to use.
        </p>
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-slate-200 bg-white p-6 transition-all hover:-translate-y-1 hover:border-indigo-300 hover:shadow-lg hover:shadow-indigo-500/5"
            >
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 font-mono text-lg text-indigo-700 transition-colors group-hover:bg-indigo-600 group-hover:text-white">
                {f.icon}
              </div>
              <h3 className="mt-5 text-lg font-semibold text-slate-900">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
