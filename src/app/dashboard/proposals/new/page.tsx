import { getSession } from "@/lib/http";
import { redirect } from "next/navigation";
import { listOrganizations } from "@/services/org.service";
import { ProposalForm } from "@/components/dashboard/ProposalForm";

export const dynamic = "force-dynamic";

export default async function NewProposalPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const organizations =
    session.role === "ADMIN" ? await listOrganizations() : [];

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-2xl font-bold">New survey proposal</h1>
      <ProposalForm
        organizations={organizations.map((o) => ({ id: o.id, name: o.name }))}
        defaultOrganizationId={session.organizationId}
      />
    </div>
  );
}
