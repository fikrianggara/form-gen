const STAGES = [
  {
    label: "Organization",
    detail: "your institution & team",
    tone: "border-slate-300 text-slate-700",
  },
  {
    label: "Survey",
    detail: "a program or collection",
    tone: "border-indigo-300 text-indigo-700",
  },
  {
    label: "Questionnaire",
    detail: "the form itself",
    tone: "border-indigo-400 text-indigo-700",
  },
  {
    label: "Respondents",
    detail: "unique private links",
    tone: "border-emerald-300 text-emerald-700",
  },
  {
    label: "Responses",
    detail: "structured, tracked",
    tone: "border-amber-300 text-amber-700",
  },
  {
    label: "Reports & API",
    detail: "analyze or integrate",
    tone: "border-slate-800 text-slate-900",
  },
];

export function BusinessFlow() {
  return (
    <section id="business-flow" className="bg-white">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-indigo-700">
          Business flow
        </p>
        <h2 className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight text-slate-900">
          One pipeline, from your organization to your systems
        </h2>
        <p className="mt-4 max-w-2xl text-lg text-slate-600">
          Surveys live under organizations; questionnaires power them;
          respondents fill them; responses become reports and API data.
        </p>

        <div className="mt-14 grid gap-3 lg:grid-cols-6">
          {STAGES.map((s, i) => (
            <div key={s.label} className="flex flex-col">
              <div
                className={`flex-1 rounded-2xl border-2 bg-white px-4 py-5 ${s.tone}`}
              >
                <div className="font-mono text-[11px] opacity-60">0{i + 1}</div>
                <div className="mt-1 text-sm font-semibold">{s.label}</div>
                <div className="mt-1 text-xs opacity-70">{s.detail}</div>
              </div>
              {i < STAGES.length - 1 && (
                <div aria-hidden className="mx-auto -my-1 text-center text-slate-300 lg:my-0 lg:-mr-2 lg:py-1">
                  <span className="hidden lg:inline">→</span>
                  <span className="lg:hidden">↓</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
