import { notFound } from "next/navigation";
import Link from "next/link";
import { verifyProposalToken } from "@/services/proposal.service";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function VerifyProposalPage({
  params,
}: {
  params: { token: string };
}) {
  let proposal;
  try {
    proposal = await verifyProposalToken(params.token);
  } catch {
    notFound();
  }

  return (
    <div className="mx-auto mt-16 max-w-md">
      <Card className="p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-2xl text-green-700">
          ✓
        </div>
        <h1 className="text-xl font-bold text-gray-900">Proposal verified</h1>
        <p className="mt-2 text-sm text-gray-600">
          <strong>{proposal.title}</strong> has been verified and can now be
          approved to create its survey.
        </p>
        <Link
          href="/dashboard/proposals"
          className="mt-6 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Back to proposals
        </Link>
      </Card>
    </div>
  );
}
