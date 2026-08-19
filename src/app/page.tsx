import Link from "next/link";
import { db } from "@/lib/db";
import {
  Hero,
  AiSection,
  Features,
  HowItWorks,
  BusinessFlow,
  ApiSection,
  FinalCta,
} from "@/components/landing";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const questionnaires = await db.questionnaire.findMany({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    select: {
      slug: true,
      title: true,
      description: true,
      _count: { select: { questions: true } },
    },
  });

  return (
    <main className="min-h-screen bg-[#faf8f4] text-slate-900">
      <Hero />
      <AiSection />
      <Features />
      <HowItWorks />

      {/* Open questionnaires strip — preserves existing public listing */}
      <section className="border-y border-slate-900/10 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-indigo-700">
            Open right now
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
            Live questionnaires
          </h2>
          {questionnaires.length === 0 ? (
            <p className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-sm text-slate-500">
              No open questionnaires right now. Check back soon.
            </p>
          ) : (
            <ul className="mt-8 grid gap-4 md:grid-cols-2">
              {questionnaires.map((q) => (
                <li key={q.slug}>
                  <Link
                    href={`/f/${q.slug}`}
                    className="group block rounded-2xl border border-slate-200 bg-white p-6 transition-colors hover:border-indigo-300 hover:bg-indigo-50/40"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-semibold text-slate-900 group-hover:text-indigo-800">
                          {q.title}
                        </h3>
                        {q.description && (
                          <p className="mt-1 text-sm text-slate-500">{q.description}</p>
                        )}
                      </div>
                      <span className="shrink-0 rounded-full bg-indigo-50 px-3 py-1 font-mono text-xs font-medium text-indigo-700">
                        {q._count.questions} Q
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <BusinessFlow />
      <ApiSection />
      <FinalCta />
    </main>
  );
}
