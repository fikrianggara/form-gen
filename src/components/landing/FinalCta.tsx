import Link from "next/link";

export function FinalCta() {
  return (
    <section className="bg-white">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="relative overflow-hidden rounded-3xl bg-indigo-600 px-8 py-16 text-center text-white">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-10"
            style={{
              backgroundImage:
                "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }}
          />
          <h2 className="relative text-3xl font-semibold tracking-tight sm:text-4xl">
            Ready to build your next survey?
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-indigo-100">
            Design the form, send the links, collect the answers — and put the
            data to work.
          </p>
          <div className="relative mt-8 flex flex-wrap justify-center gap-4">
            <Link
              href="/dashboard"
              className="rounded-xl bg-white px-6 py-3 text-sm font-semibold text-indigo-700 transition-colors hover:bg-indigo-50"
            >
              Open dashboard
            </Link>
            <Link
              href="/portal"
              className="rounded-xl border border-indigo-300 px-6 py-3 text-sm font-medium text-white transition-colors hover:border-white"
            >
              Request API access
            </Link>
          </div>
        </div>

        <footer className="mt-16 flex flex-col items-center justify-between gap-4 border-t border-slate-200 pt-8 text-sm text-slate-500 sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded bg-indigo-600 font-mono text-[11px] font-bold text-white">
              F
            </span>
            <span className="font-medium text-slate-700">FormGen</span>
            <span className="text-slate-400">·</span>
            <span>Questionnaire engine</span>
          </div>
          <div className="flex items-center gap-5">
            <a href="#features" className="transition-colors hover:text-slate-900">Features</a>
            <a href="#how-it-works" className="transition-colors hover:text-slate-900">How it works</a>
            <a href="#api" className="transition-colors hover:text-slate-900">API</a>
            <Link href="/login" className="transition-colors hover:text-slate-900">Sign in</Link>
          </div>
        </footer>
      </div>
    </section>
  );
}
