"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/cn";

type ToastVariant = "success" | "error" | "info";

interface ToastItem {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
}

export interface ToastApi {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DEFAULT_DURATION_MS = 4000;
const MAX_VISIBLE = 5;

/**
 * Lightweight toast system: <ToastProvider> in the root layout, then
 * `const { toast } = useToast()` anywhere in the tree.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (title: string, description: string | undefined, variant: ToastVariant) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev.slice(-(MAX_VISIBLE - 1)), { id, title, description, variant }]);
      window.setTimeout(() => dismiss(id), DEFAULT_DURATION_MS);
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (title, description) => push(title, description, "success"),
      error: (title, description) => push(title, description, "error"),
      info: (title, description) => push(title, description, "info"),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 top-4 z-50 flex w-full max-w-sm flex-col gap-2"
      >
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onClose={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

// ------------------------------------------------------------- rendering

const VARIANT_STYLES: Record<
  ToastVariant,
  { icon: React.ReactNode; bar: string; iconColor: string }
> = {
  success: {
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z"
          clipRule="evenodd"
        />
      </svg>
    ),
    bar: "bg-emerald-500",
    iconColor: "text-emerald-500",
  },
  error: {
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.28 7.22a.75.75 0 0 0-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 1 0 1.06 1.06L10 11.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L11.06 10l1.72-1.72a.75.75 0 0 0-1.06-1.06L10 8.94 8.28 7.22Z"
          clipRule="evenodd"
        />
      </svg>
    ),
    bar: "bg-red-500",
    iconColor: "text-red-500",
  },
  info: {
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
        <path
          fillRule="evenodd"
          d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z"
          clipRule="evenodd"
        />
      </svg>
    ),
    bar: "bg-indigo-500",
    iconColor: "text-indigo-500",
  },
};

function ToastCard({
  toast,
  onClose,
}: {
  toast: ToastItem;
  onClose: () => void;
}) {
  const style = VARIANT_STYLES[toast.variant];
  return (
    <div className="animate-toast-in pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
      <span className={cn("absolute inset-y-0 left-0 w-1", style.bar)} />
      <span className={cn("mt-0.5 shrink-0", style.iconColor)}>{style.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900">{toast.title}</p>
        {toast.description && (
          <p className="mt-0.5 text-xs text-gray-500">{toast.description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss"
        className="shrink-0 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
        </svg>
      </button>
    </div>
  );
}
