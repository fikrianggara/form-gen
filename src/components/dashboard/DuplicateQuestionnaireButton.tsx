"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { duplicateQuestionnaireAction } from "@/lib/actions/dashboard";

export default function DuplicateQuestionnaireButton({
  questionnaireId,
}: {
  questionnaireId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await duplicateQuestionnaireAction({ questionnaireId });
          if (!res?.error && res.questionnaireId) {
            router.push(`/dashboard/questionnaires/${res.questionnaireId}/edit`);
          }
        })
      }
      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
      title="Create a draft copy of this questionnaire"
    >
      {pending ? "…" : "Duplicate"}
    </button>
  );
}
