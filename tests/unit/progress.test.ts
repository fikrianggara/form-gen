import { describe, it, expect } from "vitest";
import { calculateProgress } from "@/domain/rules/progress";

describe("calculateProgress", () => {
  it("returns 100 when there are no required visible questions", () => {
    expect(calculateProgress([], new Set())).toBe(100);
  });

  it("returns 0 when nothing is answered", () => {
    expect(calculateProgress(["a", "b"], new Set())).toBe(0);
  });

  it("returns 100 when all required visible questions are answered", () => {
    expect(calculateProgress(["a", "b"], new Set(["a", "b"]))).toBe(100);
  });

  it("returns 50 when half are answered", () => {
    expect(calculateProgress(["a", "b"], new Set(["a"]))).toBe(50);
  });

  it("rounds partial progress to the nearest integer", () => {
    expect(calculateProgress(["a", "b", "c"], new Set(["a"]))).toBe(33);
    expect(calculateProgress(["a", "b", "c"], new Set(["a", "b"]))).toBe(67);
  });

  it("ignores answers to questions that are not in the required set", () => {
    expect(calculateProgress(["a"], new Set(["z", "y"]))).toBe(0);
  });
});
