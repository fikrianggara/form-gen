"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useToast } from "@/components/toast";
import { deleteResponseAction, mailblastRespondentAction } from "@/lib/actions/responses";

interface ResponseActionsMenuProps {
  questionnaireId: string;
  responseId: string;
  respondentLabel: string | null;
}

/**
 * Per-row popup action menu (TKT-017): View / Edit / Delete / Mailblast.
 * Closes on outside click / Escape.
 */
export function ResponseActionsMenu({
  questionnaireId,
  responseId,
  respondentLabel,
}: ResponseActionsMenuProps) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    setConfirmDelete(false);
  };

  const runDelete = () => {
    startTransition(async () => {
      const res = await deleteResponseAction({ questionnaireId, responseId });
      if (res.error) {
        toast.error("Delete failed", res.error);
      } else {
        toast.success("Response deleted", "The response was removed.");
      }
      close();
    });
  };

  const runMailblast = () => {
    startTransition(async () => {
      const res = await mailblastRespondentAction({ questionnaireId, responseId });
      if (res.error) {
        toast.error("Mailblast failed", res.error);
      } else {
        const target = res.email ?? respondentLabel ?? "respondent";
        toast.success(`Link sent to ${target}`, res.link ? `Invitation link: ${res.link}` : undefined);
      }
      close();
    });
  };

  return (
    <div ref={ref} className="relative inline-block text-left">
      <button
        type="button"
        aria-label="Response actions"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
          {confirmDelete ? (
            <>
              <p className="px-3 py-2 text-xs font-medium text-gray-700">Delete this response?</p>
              <div className="flex gap-1 px-2 pb-1">
                <button
                  type="button"
                  disabled={pending}
                  onClick={runDelete}
                  className="flex-1 rounded-lg bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Delete
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <Link
                href={`/dashboard/questionnaires/${questionnaireId}/responses/${responseId}`}
                onClick={close}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                View
              </Link>
              <Link
                href={`/dashboard/questionnaires/${questionnaireId}/responses/${responseId}/edit`}
                onClick={close}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                </svg>
                Edit
              </Link>
              <button
                type="button"
                disabled={pending}
                onClick={runMailblast}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="m22 7-10 6L2 7" />
                </svg>
                Mailblast
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                </svg>
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
