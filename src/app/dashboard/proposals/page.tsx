import Link from "next/link";
import { getSession } from "@/lib/http";
import { redirect } from "next/navigation";
import { listProposals } from "@/services/proposal.service";
import { Badge, Button } from "@/components/ui";
import { IconPlus } from "@/components/icons";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "gray" | "amber" | "indigo" | "green"> = {
  DRAFT: "gray",
  PENDING_VERIFICATION: "amber",
  VERIFIED: "indigo",
  APPROVED: "green",
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PENDING_VERIFICATION: "Pending verification",
  VERIFIED: "Verified",
  APPROVED: "Approved",
};

export default async function ProposalsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const proposals = await listProposals(
    session.role === "ADMIN" ? undefined : (session.organizationId ?? undefined)
  );

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Survey proposals</h1>
        <Link href="/dashboard/proposals/new">
          <Button>
            <IconPlus size={15} className="mr-2" />
            New proposal
          </Button>
        </Link>
      </div>

      {proposals.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
          No proposals yet — start one to sketch a survey before building it.
        </p>
      ) : (
        <div className="space-y-3">
          {proposals.map((p) => (
            <Link
              key={p.id}
              href={`/dashboard/proposals/${p.id}`}
              className="block rounded-xl border border-gray-200 bg-white p-5 transition hover:border-indigo-300 hover:shadow-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-gray-900">{p.title}</h2>
                  <p className="mt-0.5 text-xs text-gray-500">
                    by {p.creator?.name ?? "unknown"} · {p.createdAt.toLocaleDateString()}
                    {p.verifyEmail && (
                      <span className="ml-2 text-gray-400">verify → {p.verifyEmail}</span>
                    )}
                  </p>
                </div>
                <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status] ?? p.status}</Badge>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
