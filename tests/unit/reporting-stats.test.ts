import { describe, it, expect } from "vitest";
import {
  computeCompletionStats,
  dailyResponseCounts,
  buildChoiceDistribution,
  computeNumericStats,
} from "@/domain/reporting/stats";

describe("computeCompletionStats", () => {
  it("returns zeros for an empty set", () => {
    expect(computeCompletionStats([])).toEqual({
      total: 0,
      completed: 0,
      drafts: 0,
      completionRate: 0,
      averageProgress: 0,
    });
  });

  it("computes completion rate and average progress", () => {
    const stats = computeCompletionStats([
      { status: "COMPLETED", progress: 100, createdAt: new Date() },
      { status: "COMPLETED", progress: 100, createdAt: new Date() },
      { status: "DRAFT", progress: 33, createdAt: new Date() },
      { status: "DRAFT", progress: 0, createdAt: new Date() },
    ]);
    expect(stats.total).toBe(4);
    expect(stats.completed).toBe(2);
    expect(stats.drafts).toBe(2);
    expect(stats.completionRate).toBe(50);
    expect(stats.averageProgress).toBe(58); // (100+100+33+0)/4 = 58.25 -> 58
  });

  it("handles all drafts", () => {
    const stats = computeCompletionStats([
      { status: "DRAFT", progress: 10, createdAt: new Date() },
    ]);
    expect(stats.completionRate).toBe(0);
    expect(stats.averageProgress).toBe(10);
  });
});

describe("dailyResponseCounts", () => {
  const now = new Date("2026-08-13T12:00:00.000Z");

  it("zero-fills empty days and returns the requested window", () => {
    const counts = dailyResponseCounts([], 3, now);
    expect(counts).toEqual([
      { date: "2026-08-11", count: 0 },
      { date: "2026-08-12", count: 0 },
      { date: "2026-08-13", count: 0 },
    ]);
  });

  it("groups responses by UTC day", () => {
    const counts = dailyResponseCounts(
      [
        { status: "DRAFT", progress: 0, createdAt: "2026-08-13T01:00:00.000Z" },
        { status: "DRAFT", progress: 0, createdAt: "2026-08-13T23:00:00.000Z" },
        { status: "DRAFT", progress: 0, createdAt: "2026-08-11T12:00:00.000Z" },
      ],
      3,
      now
    );
    expect(counts.find((c) => c.date === "2026-08-13")?.count).toBe(2);
    expect(counts.find((c) => c.date === "2026-08-11")?.count).toBe(1);
    expect(counts.find((c) => c.date === "2026-08-12")?.count).toBe(0);
  });
});

describe("buildChoiceDistribution", () => {
  const options = [
    { label: "Happy", value: "happy" },
    { label: "Sad", value: "sad" },
  ];

  it("counts selections and maps labels", () => {
    const dist = buildChoiceDistribution(
      ["happy", "sad", "happy", null, ""],
      options
    );
    expect(dist).toHaveLength(2);
    expect(dist[0]).toMatchObject({ value: "happy", label: "Happy", count: 2, percent: 66.7 });
    expect(dist[1]).toMatchObject({ value: "sad", label: "Sad", count: 1, percent: 33.3 });
  });

  it("splits checkbox arrays into one entry per selection", () => {
    const dist = buildChoiceDistribution(
      [["a", "b"], ["a"], [], null],
      [
        { label: "A", value: "a" },
        { label: "B", value: "b" },
      ]
    );
    expect(dist.map((d) => d.count)).toEqual([2, 1]);
  });

  it("falls back to raw value labels for unknown options", () => {
    const dist = buildChoiceDistribution(["mystery"], options);
    expect(dist[0]).toMatchObject({ value: "mystery", label: "mystery", count: 1, percent: 100 });
  });

  it("returns an empty list when there is nothing selected", () => {
    expect(buildChoiceDistribution([null, ""])).toEqual([]);
  });
});

describe("computeNumericStats", () => {
  it("computes min/max/avg/sum skipping nulls", () => {
    const stats = computeNumericStats([10, 20, null, 30]);
    expect(stats).toEqual({ count: 3, min: 10, max: 30, avg: 20, sum: 60 });
  });

  it("rounds averages to two decimals", () => {
    const stats = computeNumericStats([1, 2, 2]);
    expect(stats?.avg).toBe(1.67);
  });

  it("returns null with nothing numeric", () => {
    expect(computeNumericStats([null, null])).toBeNull();
    expect(computeNumericStats([])).toBeNull();
  });
});
