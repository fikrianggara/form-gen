/**
 * Validation engine for visibility rules (question + block entry rules).
 * Pure and deterministic: returns a list of human-readable problems; the
 * service layer turns them into AppErrors. Rules reference questions by id,
 * so the caller supplies the questionnaire's question universe.
 */
import type { RuleOperator, VisibilityRule, VisibilityRuleClause } from "@/domain/types";

export const RULE_OPERATORS: RuleOperator[] = [
  "EQ",
  "NEQ",
  "GT",
  "GTE",
  "LT",
  "LTE",
  "CONTAINS",
  "ANY_OF",
  "NONE_OF",
];

export const NUMERIC_OPERATORS = new Set<RuleOperator>(["GT", "GTE", "LT", "LTE"]);

export interface RuleValidationContext {
  /** The question (or block) the rule belongs to. */
  questionId: string | null;
  /** Every question id in the questionnaire (any level). */
  questionIds: Set<string>;
  /** Dependency-allowed question ids: top-level, non-aggregate, non-repeatable. */
  topLevelIds: Set<string>;
  /** Operators permitted for the source question type (omit to allow all). */
  allowedOperators?: Set<string>;
}

export function validateVisibilityRule(
  rule: VisibilityRule | null | undefined,
  ctx: RuleValidationContext
): string[] {
  if (!rule) return [];
  const sets = Array.isArray(rule.sets)
    ? rule.sets
    : rule.rules
      ? [{ condition: rule.condition ?? "ALL", rules: rule.rules }]
      : [];
  const errors: string[] = [];
  sets.forEach((set, setIndex) => {
    if (set.condition !== "ALL" && set.condition !== "ANY") {
      errors.push(`rule set ${setIndex + 1}: invalid condition "${String(set.condition)}"`);
    }
    set.rules.forEach((clause, clauseIndex) => {
      const label = `rule set ${setIndex + 1}, clause ${clauseIndex + 1}`;
      errors.push(...validateClause(clause, label, ctx));
    });
  });
  return errors;
}

function validateClause(
  clause: VisibilityRuleClause,
  label: string,
  ctx: RuleValidationContext
): string[] {
  const errors: string[] = [];
  if (!clause || typeof clause.dependsOnQuestionId !== "string") {
    errors.push(`${label}: missing dependency question`);
    return errors;
  }
  const dep = clause.dependsOnQuestionId;
  if (ctx.questionId && dep === ctx.questionId) {
    errors.push(`${label}: cannot depend on itself`);
  }
  if (!ctx.questionIds.has(dep)) {
    errors.push(`${label}: dependency question "${dep}" does not exist in this questionnaire`);
    return errors;
  }
  if (!ctx.topLevelIds.has(dep)) {
    errors.push(`${label}: dependency "${dep}" is not allowed (must be a top-level, non-aggregate question)`);
  }
  if (!RULE_OPERATORS.includes(clause.operator)) {
    errors.push(`${label}: invalid operator "${String(clause.operator)}"`);
  }
  if (ctx.allowedOperators && !ctx.allowedOperators.has(clause.operator)) {
    errors.push(`${label}: operator ${clause.operator} is not allowed for the source question type`);
  }
  if (NUMERIC_OPERATORS.has(clause.operator) && typeof clause.value !== "number") {
    errors.push(`${label}: operator ${clause.operator} requires a numeric value`);
  }
  if (
    (clause.operator === "ANY_OF" || clause.operator === "NONE_OF") &&
    !Array.isArray(clause.value)
  ) {
    errors.push(`${label}: operator ${clause.operator} requires an array value`);
  }
  return errors;
}

/**
 * Global cycle detection across a questionnaire: builds the dependency graph
 * from EVERY question's rule (edges owner -> dependency) and reports cycles.
 * Call with the full questionnaire rule map (including the rule being saved).
 */
export function detectVisibilityCycles(
  ruleByQuestion: Map<string, VisibilityRule | null>,
  questionIds: Set<string>
): string[] {
  const graph = new Map<string, string[]>();
  for (const id of questionIds) graph.set(id, []);
  const extractSets = (rule: VisibilityRule | null | undefined) =>
    Array.isArray(rule?.sets)
      ? rule!.sets!
      : rule?.rules
        ? [{ condition: rule.condition ?? "ALL", rules: rule.rules }]
        : [];
  for (const [owner, rule] of ruleByQuestion) {
    if (!graph.has(owner)) graph.set(owner, []);
    for (const set of extractSets(rule)) {
      for (const clause of set.rules) {
        const dep = clause.dependsOnQuestionId;
        if (graph.has(dep) && !graph.get(owner)!.includes(dep)) {
          graph.get(owner)!.push(dep);
        }
      }
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const walk = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const next of graph.get(id) ?? []) {
      if (walk(next)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  for (const id of graph.keys()) {
    if (walk(id)) {
      return ["visibility rules create a dependency cycle"];
    }
  }
  return [];
}
