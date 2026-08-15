"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useToast } from "@/components/toast";
import { deleteResponseAction, mailblastRespondentAction } from "@/lib/actions/responses";
import {
  IconMore,
  IconEye,
  IconPencil,
  IconMail,
  IconTrash,
} from "@/components/icons";

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
        <IconMore size={16} />
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
                <IconEye size={14} />
                View
              </Link>
              <Link
                href={`/dashboard/questionnaires/${questionnaireId}/responses/${responseId}/edit`}
                onClick={close}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <IconPencil size={14} />
                Edit
              </Link>
              <button
                type="button"
                disabled={pending}
                onClick={runMailblast}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <IconMail size={14} />
                Mailblast
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
              >
                <IconTrash size={14} />
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
