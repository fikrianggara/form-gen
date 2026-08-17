"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteQuestionnaireAction } from "@/lib/actions/dashboard";
import { useToast } from "@/components/toast";
import { IconTrash } from "@/components/icons";

/**
 * TKT-040: delete a questionnaire. Destructive + irreversible (responses are
 * removed with it) so it demands a confirm(). The server action enforces the
 * strict ownership gate (admin, or the operator who created it).
 */
export default function DeleteQuestionnaireButton({
  questionnaireId,
  title,
}: {
  questionnaireId: string;
  title: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const run = () => {
    if (
      !confirm(
        `Delete "${title}"?\n\nThis permanently removes the questionnaire and ALL of its responses. Question masters and option sets are shared bank data and will NOT be deleted.`
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await deleteQuestionnaireAction({ questionnaireId });
      if (res?.error) {
        toast.error("Could not delete questionnaire", res.error);
        return;
      }
      toast.success("Questionnaire deleted", `"${title}" and its responses were removed.`);
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      disabled={pending}
      onClick={run}
      className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
      title="Delete this questionnaire and its responses"
    >
      <IconTrash size={14} />
      {pending ? "…" : "Delete"}
    </button>
  );
}
