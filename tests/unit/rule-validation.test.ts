import { describe, it, expect } from "vitest";
import { validateVisibilityRule, detectVisibilityCycles, type RuleValidationContext } from "@/domain/rules/validation";
import type { VisibilityRule } from "@/domain/types";

const ctx: RuleValidationContext = {
  questionId: "q_self",
  questionIds: new Set(["q_a", "q_b", "q_c", "q_self"]),
  topLevelIds: new Set(["q_a", "q_b", "q_c", "q_self"]),
  allowedOperators: new Set(["EQ", "NEQ", "GT", "GTE", "LT", "LTE", "CONTAINS", "ANY_OF", "NONE_OF"]),
};

const err = (msg: string) => expect.stringContaining(msg);

describe("validateVisibilityRule", () => {
  it("accepts a valid multi-set rule", () => {
    const rule: VisibilityRule = {
      sets: [
        { condition: "ALL", rules: [{ operator: "EQ", value: "yes", dependsOnQuestionId: "q_a" }] },
        { condition: "ANY", rules: [{ operator: "GTE", value: 18, dependsOnQuestionId: "q_b" }] },
      ],
    };
    expect(validateVisibilityRule(rule, ctx)).toEqual([]);
  });

  it("accepts a valid legacy single-set rule", () => {
    const rule: VisibilityRule = {
      condition: "ALL",
      rules: [{ operator: "EQ", value: "yes", dependsOnQuestionId: "q_a" }],
    };
    expect(validateVisibilityRule(rule, ctx)).toEqual([]);
  });

  it("rejects a dependency on a question that does not exist", () => {
    const rule: VisibilityRule = {
      sets: [{ condition: "ALL", rules: [{ operator: "EQ", value: "x", dependsOnQuestionId: "ghost" }] }],
    };
    const errors = validateVisibilityRule(rule, ctx);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join("\n")).toEqual(err("ghost"));
  });

  it("rejects a self-dependency", () => {
    const rule: VisibilityRule = {
      sets: [{ condition: "ALL", rules: [{ operator: "EQ", value: "x", dependsOnQuestionId: "q_self" }] }],
    };
    const errors = validateVisibilityRule(rule, ctx);
    expect(errors.join("\n")).toEqual(err("self"));
  });

  it("rejects an invalid operator", () => {
    const rule = {
      sets: [{ condition: "ALL", rules: [{ operator: "BOGUS", value: "x", dependsOnQuestionId: "q_a" }] }],
    } as unknown as VisibilityRule;
    const errors = validateVisibilityRule(rule, ctx);
    expect(errors.join("\n")).toEqual(err("operator"));
  });

  it("rejects numeric operators with a non-numeric value", () => {
    const rule: VisibilityRule = {
      sets: [{ condition: "ALL", rules: [{ operator: "GTE", value: "eighteen", dependsOnQuestionId: "q_a" }] }],
    };
    const errors = validateVisibilityRule(rule, ctx);
    expect(errors.join("\n")).toEqual(err("numeric"));
  });

  it("detects cycles across questions (full questionnaire rule map)", () => {
    const map = new Map<string, VisibilityRule | null>([
      ["q_a", { sets: [{ condition: "ALL", rules: [{ operator: "EQ", value: "x", dependsOnQuestionId: "q_b" }] }] }],
      ["q_b", { sets: [{ condition: "ALL", rules: [{ operator: "EQ", value: "x", dependsOnQuestionId: "q_a" }] }] }],
    ]);
    expect(detectVisibilityCycles(map, new Set(["q_a", "q_b"]))).toEqual(["visibility rules create a dependency cycle"]);
    // Acyclic graph passes.
    const acyclic = new Map<string, VisibilityRule | null>([
      ["q_a", { sets: [{ condition: "ALL", rules: [{ operator: "EQ", value: "x", dependsOnQuestionId: "q_b" }] }] }],
      ["q_b", null],
    ]);
    expect(detectVisibilityCycles(acyclic, new Set(["q_a", "q_b"]))).toEqual([]);
  });

  it("rejects dependencies on aggregate or repeatable-parent questions", () => {
    const rule: VisibilityRule = {
      sets: [{ condition: "ALL", rules: [{ operator: "EQ", value: "x", dependsOnQuestionId: "q_agg" }] }],
    };
    const restrictedCtx: RuleValidationContext = {
      ...ctx,
      questionIds: new Set(["q_a", "q_self", "q_agg"]),
      topLevelIds: new Set(["q_a", "q_self"]),
    };
    const errors = validateVisibilityRule(rule, restrictedCtx);
    expect(errors.join("\n")).toEqual(err("not allowed"));
  });

  it("returns no errors for a null/undefined rule", () => {
    expect(validateVisibilityRule(null, ctx)).toEqual([]);
    expect(validateVisibilityRule(undefined, ctx)).toEqual([]);
  });
});
