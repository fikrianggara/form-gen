import Link from "next/link";
import { db } from "@/lib/db";

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
    <div className="mx-auto max-w-3xl px-4 py-16">
      <header className="mb-10 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">FormGen</h1>
          <p className="mt-1 text-sm text-gray-500">
            Questionnaires with conditional logic, repeatable groups and computed totals.
          </p>
        </div>
        <Link
          href="/login"
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Sign in
        </Link>
      </header>

      {questionnaires.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">
          No open questionnaires right now.
        </p>
      ) : (
        <ul className="space-y-4">
          {questionnaires.map((q) => (
            <li key={q.slug}>
              <Link
                href={`/f/${q.slug}`}
                className="block rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">{q.title}</h2>
                    {q.description && (
                      <p className="mt-1 text-sm text-gray-500">{q.description}</p>
                    )}
                  </div>
                  <span className="shrink-0 rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
                    {q._count.questions} questions
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
