import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/http";
import { getProposal } from "@/services/proposal.service";
import { Badge, Card } from "@/components/ui";
import { ProposalActions } from "@/components/dashboard/ProposalActions";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "gray" | "amber" | "indigo" | "green"> = {
  DRAFT: "gray",
  PENDING_VERIFICATION: "amber",
  VERIFIED: "indigo",
  APPROVED: "green",
};

export default async function ProposalDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  let proposal;
  try {
    proposal = await getProposal(params.id);
  } catch {
    notFound();
  }
  if (
    session.role !== "ADMIN" &&
    proposal.organizationId !== session.organizationId
  ) {
    notFound();
  }

  const outline = Array.isArray(proposal.outline) ? (proposal.outline as Array<{ title: string; type: string }>) : [];

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/dashboard/proposals" className="text-sm text-gray-500 hover:text-gray-700">
        ← Proposals
      </Link>
      <div className="mb-6 mt-2 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{proposal.title}</h1>
        <Badge tone={STATUS_TONE[proposal.status] ?? "gray"}>{proposal.status}</Badge>
      </div>

      <Card className="mb-6 space-y-3 p-6">
        {proposal.purpose && (
          <p>
            <span className="text-xs font-semibold uppercase text-gray-500">Purpose</span>
            <br />
            {proposal.purpose}
          </p>
        )}
        {proposal.target && (
          <p>
            <span className="text-xs font-semibold uppercase text-gray-500">Target</span>
            <br />
            {proposal.target}
          </p>
        )}
        {proposal.verifyEmail && (
          <p>
            <span className="text-xs font-semibold uppercase text-gray-500">Verification email</span>
            <br />
            {proposal.verifyEmail}
          </p>
        )}
        {outline.length > 0 && (
          <div>
            <span className="text-xs font-semibold uppercase text-gray-500">Outline</span>
            <ul className="mt-1 space-y-1 text-sm">
              {outline.map((row, i) => (
                <li key={i} className="flex justify-between">
                  <span>{row.title}</span>
                  <Badge tone="indigo">{row.type}</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-xs text-gray-400">
          Created {proposal.createdAt.toLocaleString()} · updated {proposal.updatedAt.toLocaleString()}
        </p>
      </Card>

      <ProposalActions
        id={proposal.id}
        status={proposal.status}
        proposalTitle={proposal.title}
        approvedSurveyId={proposal.surveyId}
      />
    </div>
  );
}
