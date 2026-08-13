/**
 * Pure helpers for the RAG questionnaire generator.
 * No I/O: intent splitting, match merging, confidence, title and slug
 * generation are deterministic and unit-tested.
 */

export interface RagMatch {
  masterId: string;
  score: number;
  masterTitle?: string;
}

const MIN_INTENT_LENGTH = 4;
const MAX_INTENTS = 12;
const TITLE_MAX_WORDS = 8;

/**
 * Split a free-text prompt into candidate question intents.
 * Lines are split into sentences; fragments shorter than 4 chars are dropped;
 * duplicates are removed; the list is capped so a giant prompt cannot
 * explode into hundreds of retrievals.
 */
export function extractIntents(prompt: string): string[] {
  const lines = prompt
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const sentences = lines.flatMap((line) =>
    line
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim().replace(/[.!?]+$/, ""))
      .filter(Boolean)
  );

  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of sentences) {
    if (s.length < MIN_INTENT_LENGTH) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= MAX_INTENTS) break;
  }
  return out;
}

/**
 * Merge retrieval results: one entry per master, keeping the highest score,
 * ordered by score descending.
 */
export function mergeMatches(matches: RagMatch[]): RagMatch[] {
  const best = new Map<string, RagMatch>();
  for (const m of matches) {
    const current = best.get(m.masterId);
    if (!current || m.score > current.score) {
      best.set(m.masterId, m);
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

/** A score below the threshold (or missing) is a low-confidence suggestion. */
export function isLowConfidence(score: number | null | undefined, threshold: number): boolean {
  return typeof score !== "number" || score < threshold;
}

/**
 * Deterministic title generation:
 * 1. The first sentence of the prompt, cleaned and title-cased (max 8 words).
 * 2. Fallback: the best matching question's title.
 * 3. Fallback: a generic default.
 */
export function generateTitle(prompt: string, matches: RagMatch[]): string {
  const clean = prompt.replace(/\s+/g, " ").trim();
  const first = clean.split(/[.!?\n]/)[0].trim();
  const words = first.split(/\s+/).filter((w) => w.length > 2);

  if (words.length >= 3) {
    return titleCase(words.slice(0, TITLE_MAX_WORDS).join(" "));
  }
  const best = matches[0];
  if (best?.masterTitle) {
    return titleCase(best.masterTitle);
  }
  return "Generated questionnaire";
}

/** "How satisfied are you?" -> "how-satisfied-are-you" */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "generated-questionnaire";
}

function titleCase(text: string): string {
  return text
    .split(/\s+/)
    .map((w) => (w.length > 1 ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}
