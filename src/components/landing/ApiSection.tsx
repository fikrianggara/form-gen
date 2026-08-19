import Link from "next/link";

const SCOPES = [
  "questionnaires:read",
  "responses:read",
  "reports:read",
  "masters:read",
  "option-sets:read",
];

export function ApiSection() {
  return (
    <section id="api" className="bg-[#0b1220] text-slate-100">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-24 lg:grid-cols-2">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-indigo-400">
            Public REST API · v1
          </p>
          <h2 className="mt-4 text-4xl font-semibold tracking-tight text-white">
            Your data, in your systems
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-slate-300">
            Every questionnaire, response, and report is available through a
            documented API — keyed, scoped, and rate-limited. Request access
            through the portal, or read the live docs.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="/api/docs"
              className="rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
            >
              Browse API docs →
            </Link>
            <Link
              href="/portal"
              className="rounded-xl border border-slate-700 px-6 py-3 text-sm font-medium text-slate-200 transition-colors hover:border-slate-500 hover:text-white"
            >
              Request an API key
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-700/70 bg-slate-900/80 p-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <span className="font-mono text-xs text-slate-500">scopes</span>
            <span className="rounded-full bg-emerald-500/15 px-3 py-1 font-mono text-[11px] text-emerald-400">
              Bearer
            </span>
          </div>
          <ul className="mt-4 space-y-2">
            {SCOPES.map((s) => (
              <li
                key={s}
                className="flex items-center justify-between rounded-lg bg-slate-800/60 px-3 py-2 font-mono text-sm text-slate-300"
              >
                <span>{s}</span>
                <span className="text-xs text-slate-600">read</span>
              </li>
            ))}
          </ul>
          <div className="mt-5 rounded-lg border border-dashed border-slate-700 px-3 py-3 font-mono text-xs leading-relaxed text-slate-500">
            <span className="text-slate-400">GET</span> /api/v1/questionnaires
            <span className="text-slate-600">?page=1&pageSize=50</span>
            <br />
            <span className="text-slate-400">Authorization:</span> Bearer fg_live_…
          </div>
        </div>
      </div>
    </section>
  );
}
