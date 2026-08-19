import Link from "next/link";
import { getSession } from "@/lib/http";
import { redirect } from "next/navigation";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session || !(session.role === "ADMIN" || session.role === "DEV")) redirect("/dashboard");

  return (
    <div className="min-h-screen">
      <nav className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="text-lg font-bold text-gray-900">
              FormGen <span className="text-sm font-normal text-gray-400">/ admin</span>
            </Link>
            <div className="flex items-center gap-1 text-sm">
              <Link href="/admin/users" className="rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-100">
                Users
              </Link>
              <Link href="/admin/orgs" className="rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-100">
                Organizations
              </Link>
              <Link href="/admin/question-masters" className="rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-100">
                Question masters
              </Link>
              <Link href="/admin/option-sets" className="rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-100">
                Option sets
              </Link>
              <Link href="/admin/api-keys" className="rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-100">
                API keys
              </Link>
            </div>
          </div>
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">
            ← Dashboard
          </Link>
        </div>
      </nav>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
