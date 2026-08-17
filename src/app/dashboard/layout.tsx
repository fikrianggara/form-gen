import Link from "next/link";
import { getSession } from "@/lib/http";
import { logoutAction } from "@/lib/actions/auth";
import { redirect } from "next/navigation";
import { IconLogOut } from "@/components/icons";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen">
      <nav className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="text-lg font-bold text-gray-900">
              FormGen
            </Link>
            <div className="flex items-center gap-1 text-sm">
              <Link
                href="/dashboard"
                className="rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-100"
              >
                Questionnaires
              </Link>
              <Link
                href="/dashboard/generate"
                className="rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-100"
              >
                Generate
              </Link>
              <Link
                href="/dashboard/proposals"
                className="rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-100"
              >
                Proposals
              </Link>
              {session.role === "ADMIN" && (
                <Link
                  href="/admin/users"
                  className="rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-100"
                >
                  Admin
                </Link>
              )}
              <Link
                href="/"
                className="rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-100"
              >
                Public site
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">
              {session.name}
              <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700">
                {session.role}
              </span>
            </span>
            <form action={logoutAction}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
              >
                <IconLogOut size={15} />
                Sign out
              </button>
            </form>
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
