"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  submitProposalAction,
  approveProposalAction,
} from "@/lib/actions/proposals";
import { Button } from "@/components/ui";
import { useToast } from "@/components/toast";

export function ProposalActions({
  id,
  status,
  proposalTitle,
  approvedSurveyId,
}: {
  id: string;
  status: "DRAFT" | "PENDING_VERIFICATION" | "VERIFIED" | "APPROVED";
  proposalTitle: string;
  approvedSurveyId: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ error?: string; surveyId?: string }>, success: string) => {
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (res.error) {
        setError(res.error);
        toast.error("Action failed", res.error);
      } else {
        toast.success(success);
        router.refresh();
        if (res.surveyId) {
          router.push(
            `/dashboard/new?surveyId=${res.surveyId}&title=${encodeURIComponent(proposalTitle)}`
          );
        }
      }
    });
  };

  return (
    <div className="space-y-3">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {status === "DRAFT" && (
        <Button
          disabled={pending}
          onClick={() =>
            run(() => submitProposalAction({ id }), "Proposal submitted")
          }
        >
          Submit proposal
        </Button>
      )}

      {status === "VERIFIED" && (
        <Button
          disabled={pending}
          onClick={() =>
            run(() => approveProposalAction({ id }), "Proposal approved")
          }
        >
          Approve &amp; create survey
        </Button>
      )}

      {status === "APPROVED" && approvedSurveyId && (
        <Button
          onClick={() =>
            router.push(`/dashboard/new?surveyId=${approvedSurveyId}`)
          }
        >
          Build questionnaire
        </Button>
      )}
    </div>
  );
}
