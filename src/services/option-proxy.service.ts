import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { mapOptionItem, resolveItemsPath, type OptionItem } from "@/domain/options";

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  expiresAt: number;
  items: OptionItem[];
}

const cache = new Map<string, CacheEntry>();

export interface OptionSetOptions {
  source: "STATIC" | "EXTERNAL_API";
  items: OptionItem[];
}

/**
 * Resolve the option list for an option set.
 * - STATIC: stored options.
 * - EXTERNAL_API: server-side fetch (no CORS/secret exposure), with a timeout
 *   and a short in-memory cache. Failures bubble up so the API route can
 *   respond with a stable error shape.
 * Pass `{ fresh: true }` (e.g. the admin "Test" button) to bypass the cache.
 */
export async function getOptionSetOptions(
  optionSetId: string,
  opts: { fresh?: boolean } = {}
): Promise<OptionSetOptions> {
  const set = await db.optionSet.findUnique({
    where: { id: optionSetId },
    include: { options: { orderBy: { order: "asc" } } },
  });
  if (!set) throw new NotFoundError("Option set not found");

  if (set.source === "STATIC") {
    return {
      source: "STATIC",
      items: set.options.map((o) => ({ label: o.label, value: o.value })),
    };
  }

  const cached = opts.fresh ? undefined : cache.get(optionSetId);
  if (cached && cached.expiresAt > Date.now()) {
    return { source: "EXTERNAL_API", items: cached.items };
  }

  const items = await fetchExternalOptions(set);
  cache.set(optionSetId, { expiresAt: Date.now() + CACHE_TTL_MS, items });
  return { source: "EXTERNAL_API", items };
}

async function fetchExternalOptions(set: {
  apiUrl: string | null;
  apiMethod: string | null;
  apiHeaders: unknown;
  itemsPath: string | null;
}): Promise<OptionItem[]> {
  if (!set.apiUrl) throw new NotFoundError("Option set has no API URL");

  const timeoutMs = Number(process.env.OPTION_PROXY_TIMEOUT_MS ?? 5000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {};
    if (set.apiHeaders && typeof set.apiHeaders === "object") {
      for (const [k, v] of Object.entries(set.apiHeaders as Record<string, unknown>)) {
        if (typeof v === "string") headers[k] = v;
      }
    }
    const res = await fetch(set.apiUrl, {
      method: set.apiMethod ?? "GET",
      headers,
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`External option API responded with HTTP ${res.status}`);
    }
    const payload: unknown = await res.json();
    const rawItems = resolveItemsPath(payload, set.itemsPath);
    return rawItems.map(mapOptionItem);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`External option API timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Clear the in-memory cache (used by tests). */
export function clearOptionCache(): void {
  cache.clear();
}
