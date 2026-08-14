/**
 * Pure helpers for mapping external API payloads to option lists.
 * Used by the option proxy service; kept I/O-free for unit testing.
 */

export interface OptionItem {
  label: string;
  value: string;
}

/**
 * Resolve an array inside an arbitrary JSON payload using a dotted path
 * (e.g. "data.items"). An empty/undefined path means the payload itself.
 * Throws when the resolved value is not an array.
 */
export function resolveItemsPath(
  payload: unknown,
  path: string | null | undefined
): unknown[] {
  let current: unknown = payload;
  if (path) {
    for (const segment of path.split(".")) {
      if (current === null || typeof current !== "object" || !(segment in (current as Record<string, unknown>))) {
        throw new Error(`Option payload path "${path}" did not resolve to an array`);
      }
      current = (current as Record<string, unknown>)[segment];
    }
  }
  if (!Array.isArray(current)) {
    throw new Error(`Option payload path "${path ?? "(root)"}" did not resolve to an array`);
  }
  return current;
}

/**
 * Normalize one raw item into { label, value }:
 * - label: label > name > title > stringified item
 * - value: value > id > code > label
 */
export function mapOptionItem(item: unknown): OptionItem {
  if (item === null || item === undefined) {
    return { label: "", value: "" };
  }
  if (typeof item !== "object") {
    const s = String(item);
    return { label: s, value: s };
  }
  const rec = item as Record<string, unknown>;
  const label = pickString(rec, ["label", "name", "title"]) ?? String(item);
  const value = pickString(rec, ["value", "id", "code"]) ?? label;
  return { label, value };
}

function pickString(rec: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const v = rec[key];
    if (v !== undefined && v !== null) return String(v);
  }
  return null;
}

/**
 * Resolve a possibly-nested value by dotted key path, e.g. "user.name".
 * Returns `undefined` when any segment is missing (never throws).
 */
export function getPath(item: unknown, path: string | null | undefined): unknown {
  if (!path) return undefined;
  let current: unknown = item;
  for (const segment of path.split(".")) {
    if (current === null || typeof current !== "object" || !(segment in (current as Record<string, unknown>))) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/**
 * Map one raw item to { label, value } using optional dotted keys.
 * - labelKey/valueKey given: resolve via getPath and stringify.
 * - missing key result: fall back to the standard key order, then the item.
 */
export function mapOptionItemWithKeys(
  item: unknown,
  labelKey: string | null | undefined,
  valueKey: string | null | undefined
): OptionItem {
  const base = mapOptionItem(item);
  const label = getPath(item, labelKey);
  const value = getPath(item, valueKey);
  return {
    label: label === undefined || label === null ? base.label : String(label),
    value: value === undefined || value === null ? base.value : String(value),
  };
}
