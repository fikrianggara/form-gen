import { describe, it, expect } from "vitest";
import {
  cosineToScore,
  hybridScore,
  mergeHybridMatches,
  type HybridRetrievalResult,
} from "@/domain/rag/hybrid";

describe("cosineToScore", () => {
  it("converts cosine distance to a 0..1 score", () => {
    expect(cosineToScore(0)).toBe(1);
    expect(cosineToScore(0.2)).toBeCloseTo(0.8);
    expect(cosineToScore(1)).toBe(0);
  });

  it("clamps out-of-range distances", () => {
    expect(cosineToScore(1.5)).toBe(0);
    expect(cosineToScore(-0.5)).toBe(1);
  });
});

describe("hybridScore", () => {
  it("blends vector and trigram scores with the given weight", () => {
    expect(hybridScore(0.8, 0.4, 0.6)).toBeCloseTo(0.64);
    expect(hybridScore(0.8, 0.4, 0.5)).toBeCloseTo(0.6);
  });

  it("uses the vector score alone when trigram is missing", () => {
    expect(hybridScore(0.7, null, 0.6)).toBe(0.7);
  });

  it("uses the trigram score alone when vector is missing", () => {
    expect(hybridScore(null, 0.5, 0.6)).toBe(0.5);
  });

  it("returns null when neither source has a score", () => {
    expect(hybridScore(null, null, 0.6)).toBeNull();
  });

  it("clamps the blended result to 0..1", () => {
    expect(hybridScore(1, 1, 0.5)).toBe(1);
  });
});

describe("mergeHybridMatches", () => {
  it("dedupes by master keeping the best per-source score", () => {
    const results: HybridRetrievalResult[] = [
      { masterId: "a", masterTitle: "A", trigramScore: 0.4, vectorScore: 0.8 },
      { masterId: "a", masterTitle: "A", trigramScore: 0.5, vectorScore: 0.6 },
      { masterId: "b", masterTitle: "B", trigramScore: 0.3, vectorScore: null },
      { masterId: "c", masterTitle: "C", trigramScore: null, vectorScore: 0.9 },
    ];
    const merged = mergeHybridMatches(results, 0.6);
    // a: 0.6*0.8 + 0.4*0.5 = 0.68 ; c: 0.9 ; b: 0.3
    expect(merged.map((m) => m.masterId)).toEqual(["c", "a", "b"]);
    expect(merged[0]?.score).toBeCloseTo(0.9);
    expect(merged[1]?.score).toBeCloseTo(0.68);
    expect(merged[2]?.score).toBeCloseTo(0.3);
  });

  it("returns an empty list for empty input", () => {
    expect(mergeHybridMatches([])).toEqual([]);
  });

  it("sorts by descending score", () => {
    const results: HybridRetrievalResult[] = [
      { masterId: "x", masterTitle: "X", trigramScore: 0.2, vectorScore: 0.2 },
      { masterId: "y", masterTitle: "Y", trigramScore: 0.9, vectorScore: 0.9 },
    ];
    const merged = mergeHybridMatches(results);
    expect(merged[0]?.masterId).toBe("y");
  });
});
