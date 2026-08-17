/** Canonical capability scopes for the public API (analysis v03 §3.2).
 * Client-safe module: no Node built-ins — safe to import in "use client". */

export const API_SCOPES = [
  "questionnaires:read",
  "responses:read",
  "reports:read",
  "masters:read",
  "option-sets:read",
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

export function isApiScope(value: unknown): value is ApiScope {
  return typeof value === "string" && (API_SCOPES as readonly string[]).includes(value);
}
