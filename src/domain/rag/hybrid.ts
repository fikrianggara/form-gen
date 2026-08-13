/**
 * Hybrid retrieval scoring: blend vector (cosine) and lexical (trigram)
 * similarities into a single 0..1 confidence score. Pure and deterministic.
 */
import type { RagMatch } from "@/domain/rag/intents";

/** pgvector cosine distance (0 = identical) -> similarity score clamped to 0..1. */
export function cosineToScore(cosineDistance: number): number {
  return Math.min(1, Math.max(0, 1 - cosineDistance));
}

/**
 * Blend vector + trigram scores. When one source is missing, the other is
 * used alone so the system degrades gracefully (trigram-only mode).
 */
export function hybridScore(
  vectorScore: number | null,
  trigramScore: number | null,
  weight = 0.6
): number | null {
  if (vectorScore === null && trigramScore === null) return null;
  if (vectorScore === null) return clamp01(trigramScore!);
  if (trigramScore === null) return clamp01(vectorScore);
  return clamp01(weight * vectorScore + (1 - weight) * trigramScore);
}

/** One candidate from a hybrid retrieval pass, before merging across queries. */
export interface HybridRetrievalResult {
  masterId: string;
  masterTitle: string;
  trigramScore: number | null;
  vectorScore: number | null;
}

/**
 * Merge hybrid results across queries: one entry per master keeping the best
 * per-source score, with the final confidence computed by hybridScore.
 */
export function mergeHybridMatches(
  results: HybridRetrievalResult[],
  weight = 0.6
): RagMatch[] {
  const best = new Map<string, HybridRetrievalResult>();
  for (const r of results) {
    const current = best.get(r.masterId);
    if (!current) {
      best.set(r.masterId, r);
      continue;
    }
    const trigramScore = Math.max(
      current.trigramScore ?? 0,
      r.trigramScore ?? 0
    );
    const vectorScore = Math.max(current.vectorScore ?? 0, r.vectorScore ?? 0);
    best.set(r.masterId, { ...current, trigramScore, vectorScore });
  }
  return [...best.values()]
    .map((r) => ({
      masterId: r.masterId,
      masterTitle: r.masterTitle,
      score: hybridScore(r.vectorScore, r.trigramScore, weight) ?? 0,
    }))
    .sort((a, b) => b.score - a.score);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
