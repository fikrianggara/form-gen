import { describe, it, expect } from "vitest";
import { evaluateVisibility, isRuleSatisfied } from "@/domain/rules/visibility";
import type { VisibilityRule, AnswerValue } from "@/domain/types";

describe("isRuleSatisfied", () => {
  it("EQ matches an equal string value", () => {
    expect(
      isRuleSatisfied(
        { operator: "EQ", value: "yes", dependsOnQuestionId: "a" },
        "yes"
      )
    ).toBe(true);
  });

  it("EQ rejects a different value", () => {
    expect(
      isRuleSatisfied(
        { operator: "EQ", value: "yes", dependsOnQuestionId: "a" },
        "no"
      )
    ).toBe(false);
  });

  it("EQ rejects a null answer", () => {
    expect(
      isRuleSatisfied(
        { operator: "EQ", value: "yes", dependsOnQuestionId: "a" },
        null
      )
    ).toBe(false);
  });

  it("NEQ matches when the answer differs", () => {
    expect(
      isRuleSatisfied(
        { operator: "NEQ", value: "no", dependsOnQuestionId: "a" },
        "yes"
      )
    ).toBe(true);
  });

  it("GTE compares numeric values", () => {
    const rule = { operator: "GTE" as const, value: 18, dependsOnQuestionId: "a" };
    expect(isRuleSatisfied(rule, 18)).toBe(true);
    expect(isRuleSatisfied(rule, 21)).toBe(true);
    expect(isRuleSatisfied(rule, 17)).toBe(false);
  });

  it("GTE treats a missing numeric answer as unsatisfied", () => {
    expect(
      isRuleSatisfied(
        { operator: "GTE", value: 18, dependsOnQuestionId: "a" },
        null
      )
    ).toBe(false);
  });

  it("LT/LTE/GT/LT work on numbers", () => {
    expect(isRuleSatisfied({ operator: "LT", value: 10, dependsOnQuestionId: "a" }, 9)).toBe(true);
    expect(isRuleSatisfied({ operator: "LT", value: 10, dependsOnQuestionId: "a" }, 10)).toBe(false);
    expect(isRuleSatisfied({ operator: "LTE", value: 10, dependsOnQuestionId: "a" }, 10)).toBe(true);
    expect(isRuleSatisfied({ operator: "GT", value: 10, dependsOnQuestionId: "a" }, 11)).toBe(true);
  });

  it("CONTAINS matches a checkbox array containing the value", () => {
    expect(
      isRuleSatisfied(
        { operator: "CONTAINS", value: "x", dependsOnQuestionId: "a" },
        ["x", "y"]
      )
    ).toBe(true);
    expect(
      isRuleSatisfied(
        { operator: "CONTAINS", value: "x", dependsOnQuestionId: "a" },
        ["y"]
      )
    ).toBe(false);
  });

  it("ANY_OF matches when the answer is in the list", () => {
    expect(
      isRuleSatisfied(
        { operator: "ANY_OF", value: ["a", "b"], dependsOnQuestionId: "q" },
        "b"
      )
    ).toBe(true);
    expect(
      isRuleSatisfied(
        { operator: "ANY_OF", value: ["a", "b"], dependsOnQuestionId: "q" },
        "c"
      )
    ).toBe(false);
  });

  it("NONE_OF matches when the answer is not in the list", () => {
    expect(
      isRuleSatisfied(
        { operator: "NONE_OF", value: ["a", "b"], dependsOnQuestionId: "q" },
        "c"
      )
    ).toBe(true);
    expect(
      isRuleSatisfied(
        { operator: "NONE_OF", value: ["a", "b"], dependsOnQuestionId: "q" },
        "a"
      )
    ).toBe(false);
  });
});

describe("evaluateVisibility", () => {
  const answers: Record<string, AnswerValue> = {
    q_age: 21,
    q_owns_car: "yes",
    q_hobbies: ["sports", "music"],
  };

  it("returns true when there is no rule", () => {
    expect(evaluateVisibility(null, answers)).toBe(true);
    expect(evaluateVisibility(undefined, answers)).toBe(true);
  });

  it("returns true when all rules match (condition ALL)", () => {
    const rule: VisibilityRule = {
      condition: "ALL",
      rules: [
        { dependsOnQuestionId: "q_age", operator: "GTE", value: 18 },
        { dependsOnQuestionId: "q_owns_car", operator: "EQ", value: "yes" },
      ],
    };
    expect(evaluateVisibility(rule, answers)).toBe(true);
  });

  it("returns false when one rule fails (condition ALL)", () => {
    const rule: VisibilityRule = {
      condition: "ALL",
      rules: [
        { dependsOnQuestionId: "q_age", operator: "GTE", value: 18 },
        { dependsOnQuestionId: "q_owns_car", operator: "EQ", value: "no" },
      ],
    };
    expect(evaluateVisibility(rule, answers)).toBe(false);
  });

  it("returns true when any rule matches (condition ANY)", () => {
    const rule: VisibilityRule = {
      condition: "ANY",
      rules: [
        { dependsOnQuestionId: "q_age", operator: "GTE", value: 65 },
        { dependsOnQuestionId: "q_owns_car", operator: "EQ", value: "yes" },
      ],
    };
    expect(evaluateVisibility(rule, answers)).toBe(true);
  });

  it("returns false when no rule matches (condition ANY)", () => {
    const rule: VisibilityRule = {
      condition: "ANY",
      rules: [
        { dependsOnQuestionId: "q_age", operator: "GTE", value: 65 },
        { dependsOnQuestionId: "q_owns_car", operator: "EQ", value: "no" },
      ],
    };
    expect(evaluateVisibility(rule, answers)).toBe(false);
  });

  it("an empty rules array is always satisfied", () => {
    expect(evaluateVisibility({ condition: "ALL", rules: [] }, answers)).toBe(true);
    expect(evaluateVisibility({ condition: "ANY", rules: [] }, answers)).toBe(false);
  });

  it("CHECKBOX answers work through CONTAINS in a rule", () => {
    const rule: VisibilityRule = {
      condition: "ALL",
      rules: [{ dependsOnQuestionId: "q_hobbies", operator: "CONTAINS", value: "sports" }],
    };
    expect(evaluateVisibility(rule, answers)).toBe(true);
  });
});
