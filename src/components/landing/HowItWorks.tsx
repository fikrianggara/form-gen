const STEPS = [
  {
    n: "01",
    title: "Design",
    body: "Build the questionnaire with questions, choices, conditional rules, repeatable groups, and computed totals. Reuse shared question masters and option sets.",
  },
  {
    n: "02",
    title: "Distribute",
    body: "Attach the questionnaire to a survey, add respondent emails, and send unique private links. Each person answers their own copy — no shared login.",
  },
  {
    n: "03",
    title: "Collect",
    body: "Responses stream in with status tracking, editing, and approval. Conditional logic keeps the data consistent as it arrives.",
  },
  {
    n: "04",
    title: "Analyze & integrate",
    body: "Review aggregated reports in-app, or pull questionnaires, responses, and reports through the scoped REST API into your own systems.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-[#faf8f4]">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-indigo-700">
          How it works
        </p>
        <h2 className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight text-slate-900">
          From blank page to integrated data in four steps
        </h2>
        <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.n} className="relative rounded-2xl border border-slate-200 bg-white p-6">
              <span className="font-mono text-3xl font-bold text-indigo-100">{s.n}</span>
              <h3 className="mt-3 text-lg font-semibold text-slate-900">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
