import { getAdminCreditDashboardAction } from "@/lib/actions/credits";
import { AiCreditsPanel } from "@/components/admin/AiCreditsPanel";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Admin AI-credit management (TKT-070):
 * Global daily default, per-user daily allowance, and dated balance adjustments.
 */
export default async function AdminAiCreditsPage() {
  const res = await getAdminCreditDashboardAction();
  if (res.error || !res.data) {
    redirect("/dashboard");
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">AI Credits Management</h1>
        <p className="mt-1 text-sm text-gray-500">
          Configure global daily defaults, per-user allowances, and manage dated top-ups.
        </p>
      </div>
      <AiCreditsPanel initialData={res.data} />
    </div>
  );
}
