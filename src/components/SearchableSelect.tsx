"use client";

import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export interface SearchableOption {
  id: string;
  label: string;
  sub?: string;
}

/**
 * Lightweight searchable combobox: type to filter, click to select.
 * Used for the question-master picker in the builder.
 */
export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Type to search…",
}: {
  options: SearchableOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) =>
      `${o.label} ${o.sub ?? ""}`.toLowerCase().includes(q)
    );
  }, [options, query]);

  const selected = options.find((o) => o.id === value);

  return (
    <div className="relative">
      <input
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        value={open ? query : selected?.label ?? ""}
        placeholder={placeholder}
        onFocus={() => {
          if (blurTimer.current) clearTimeout(blurTimer.current);
          setQuery("");
          setOpen(true);
        }}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 150);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
      />
      {open && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-sm text-gray-400">No matches</li>
          )}
          {filtered.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(o.id);
                  setOpen(false);
                }}
                className={cn(
                  "block w-full px-3 py-2 text-left text-sm hover:bg-indigo-50",
                  o.id === value ? "bg-indigo-50 font-medium text-indigo-700" : "text-gray-800"
                )}
              >
                <span className="block">{o.label}</span>
                {o.sub && <span className="block text-xs text-gray-400">{o.sub}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
