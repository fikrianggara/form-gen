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

export function Hero() {
  return (
    <header className="relative overflow-hidden bg-[#0b1220] text-slate-100">
      {/* faint grid backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />
      <nav className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-500 font-mono text-sm font-bold text-white">
            F
          </span>
          <span className="text-lg font-semibold tracking-tight text-white">FormGen</span>
        </Link>
        <div className="hidden items-center gap-6 text-sm text-slate-300 md:flex">
          <a href="#features" className="transition-colors hover:text-white">Features</a>
          <a href="#how-it-works" className="transition-colors hover:text-white">How it works</a>
          <a href="#business-flow" className="transition-colors hover:text-white">Business flow</a>
          <a href="#api" className="transition-colors hover:text-white">API</a>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:text-white"
          >
            Sign in
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
          >
            Open dashboard
          </Link>
        </div>
      </nav>

      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-6 pb-24 pt-16 lg:grid-cols-2 lg:pt-24">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-indigo-400">
            Questionnaire engine · Conditional logic · Computed questions
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

        {/* product mock */}
        <div className="relative">
          <div
            aria-hidden
            className="absolute -inset-6 rounded-3xl bg-indigo-500/20 blur-3xl"
          />
          <div className="relative rounded-2xl border border-slate-700/70 bg-slate-900/80 p-5 shadow-2xl backdrop-blur">
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
        </div>
      </div>
    </header>
  );
}
