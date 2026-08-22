import { getAdminApiKeyDashboard } from "@/lib/actions/api-keys";
import { ApiKeysPanel } from "@/components/admin/ApiKeysPanel";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

/** Admin API-key management (TKT-036): list, issue, approve, revoke, usage. */
export default async function AdminApiKeysPage() {
  const dashboard = await getAdminApiKeyDashboard();
  if (!dashboard) redirect("/login");

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">API Keys</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage public REST API keys and access requests.
          </p>
        </div>
        <Link
          href="/api/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-900"
        >
          API Documentation →
        </Link>
      </div>
      <ApiKeysPanel dashboard={dashboard} />
    </div>
  );
}
