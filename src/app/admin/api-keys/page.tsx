import { getAdminApiKeyDashboard } from "@/lib/actions/api-keys";
import { ApiKeysPanel } from "@/components/admin/ApiKeysPanel";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Admin API-key management (TKT-036): list, issue, approve, revoke, usage. */
export default async function AdminApiKeysPage() {
  const dashboard = await getAdminApiKeyDashboard();
  if (!dashboard) redirect("/login");

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">API Keys</h1>
      <ApiKeysPanel dashboard={dashboard} />
    </div>
  );
}
