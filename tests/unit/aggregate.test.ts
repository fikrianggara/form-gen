import { describe, it, expect } from "vitest";
import {
  sumValues,
  sumSourceAcrossRows,
  computeAggregate,
} from "@/domain/rules/aggregate";
import type { AggregateConfig } from "@/domain/types";

describe("sumValues", () => {
  it("returns null for an empty list", () => {
    expect(sumValues([])).toBeNull();
  });

  it("returns null when all values are null", () => {
    expect(sumValues([null, null])).toBeNull();
  });

  it("sums numeric values", () => {
    expect(sumValues([1, 2, 3])).toBe(6);
  });

  it("skips null values", () => {
    expect(sumValues([1, null, 3])).toBe(4);
  });

  it("handles floats", () => {
    expect(sumValues([1.5, 2.25])).toBeCloseTo(3.75);
  });
});

describe("sumSourceAcrossRows", () => {
  const rows: Array<Record<string, number | null>> = [
    { expense: 100, note: null },
    { expense: 250, note: null },
    { expense: null, note: null },
  ];

  it("sums one field across all rows", () => {
    expect(sumSourceAcrossRows("expense", rows)).toBe(350);
  });

  it("returns null when no row has a value", () => {
    expect(sumSourceAcrossRows("expense", [{ expense: null }, { expense: null }])).toBeNull();
  });

  it("returns null for zero rows", () => {
    expect(sumSourceAcrossRows("expense", [])).toBeNull();
  });
});

describe("computeAggregate", () => {
  it("computes SUM over a flat set of values", () => {
    const config: AggregateConfig = { type: "SUM", sourceQuestionId: "expense" };
    expect(computeAggregate(config, { expense: [100, 200, 300] })).toBe(600);
  });

  it("returns null when the source is unknown", () => {
    const config: AggregateConfig = { type: "SUM", sourceQuestionId: "missing" };
    expect(computeAggregate(config, { expense: [1] })).toBeNull();
  });

  it("skips null values in the source list", () => {
    const config: AggregateConfig = { type: "SUM", sourceQuestionId: "expense" };
    expect(computeAggregate(config, { expense: [10, null, 20] })).toBe(30);
  });
});
