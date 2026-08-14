/**
 * Shared domain types for the form engine.
 * These shapes are persisted in Prisma `Json` columns and validated with Zod
 * (see src/lib/schemas.ts). Keeping them here gives the pure domain functions
 * and the client renderer a single source of truth.
 */

export type RuleOperator =
  | "EQ"
  | "NEQ"
  | "GT"
  | "GTE"
  | "LT"
  | "LTE"
  | "CONTAINS"
  | "ANY_OF"
  | "NONE_OF";

export interface VisibilityRuleClause {
  dependsOnQuestionId: string;
  operator: RuleOperator;
  value: string | number | string[];
}

/**
 * One rule set: clauses combined with `condition` (ALL = every clause, ANY = at
 * least one). Multiple sets combine with OR (question visible if ANY set
 * passes).
 */
export interface VisibilityRuleSet {
  condition: "ALL" | "ANY";
  rules: VisibilityRuleClause[];
}

/**
 * Visibility rule.
 * - Legacy shape: `{ condition, rules }` — a single set.
 * - Multi-set shape: `{ sets: VisibilityRuleSet[] }` — OR between sets.
 * The evaluator prefers `sets` when present; `condition`/`rules` are kept for
 * backward compatibility with existing stored rules.
 */
export interface VisibilityRule {
  condition?: "ALL" | "ANY";
  rules?: VisibilityRuleClause[];
  sets?: VisibilityRuleSet[];
}

export interface AggregateConfig {
  type: "SUM";
  sourceQuestionId: string;
}

/**
 * A resolved answer value per question type.
 * - TEXT / TEXTAREA / RADIO / SELECT -> string
 * - NUMBER / RATING -> number
 * - DATE -> ISO date string (yyyy-MM-dd)
 * - CHECKBOX -> string[] of selected option values
 */
export type AnswerValue = string | number | string[] | null;
