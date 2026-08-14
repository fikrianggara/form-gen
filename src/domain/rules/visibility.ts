import type {
  AnswerValue,
  RuleOperator,
  VisibilityRule,
  VisibilityRuleClause,
} from "@/domain/types";

/** Normalize an answer to a comparable primitive for a given operator. */
function toComparable(
  operator: RuleOperator,
  answer: AnswerValue
): string | number | string[] | null {
  if (answer === null || answer === undefined) return null;
  if (operator === "CONTAINS" || operator === "ANY_OF" || operator === "NONE_OF") {
    return Array.isArray(answer) ? answer : [String(answer)];
  }
  if (typeof answer === "number" && Number.isFinite(answer)) return answer;
  return String(answer);
}

/**
 * Evaluate a single rule clause against one answer.
 * Pure function: no I/O, deterministic.
 */
export function isRuleSatisfied(rule: VisibilityRuleClause, answer: AnswerValue): boolean {
  const actual = toComparable(rule.operator, answer);
  if (actual === null) return false;

  switch (rule.operator) {
    case "EQ":
      return actual === rule.value;
    case "NEQ":
      return actual !== rule.value;
    case "GT":
      return (
        typeof actual === "number" &&
        typeof rule.value === "number" &&
        actual > rule.value
      );
    case "GTE":
      return (
        typeof actual === "number" &&
        typeof rule.value === "number" &&
        actual >= rule.value
      );
    case "LT":
      return (
        typeof actual === "number" &&
        typeof rule.value === "number" &&
        actual < rule.value
      );
    case "LTE":
      return (
        typeof actual === "number" &&
        typeof rule.value === "number" &&
        actual <= rule.value
      );
    case "CONTAINS": {
      const list = Array.isArray(actual) ? actual : [String(actual)];
      return list.includes(String(rule.value));
    }
    case "ANY_OF": {
      const allowed = Array.isArray(rule.value) ? rule.value : [rule.value];
      const list = Array.isArray(actual) ? actual : [String(actual)];
      return list.some((v) => allowed.includes(v));
    }
    case "NONE_OF": {
      const forbidden = Array.isArray(rule.value) ? rule.value : [rule.value];
      const list = Array.isArray(actual) ? actual : [String(actual)];
      return !list.some((v) => forbidden.includes(v));
    }
    default:
      return false;
  }
}

/**
 * Evaluate a full visibility rule against a map of questionId -> answer.
 * `null` / `undefined` rule means the question is always visible.
 * Multi-set shape: visible when ANY set passes (sets combine with OR).
 * Legacy single-set shape: visible per its condition.
 * Unknown dependency questions are treated as unanswered (rule unsatisfied),
 * which keeps behaviour safe when a questionnaire is edited mid-flight.
 */
export function evaluateVisibility(
  rule: VisibilityRule | null | undefined,
  answers: Record<string, AnswerValue>
): boolean {
  if (!rule) return true;
  // Multi-set shape takes precedence when present.
  if (Array.isArray(rule.sets)) {
    if (rule.sets.length === 0) return true;
    return rule.sets.some((set) => evaluateSet(set, answers));
  }
  // Legacy shape: a single set.
  if (!Array.isArray(rule.rules)) return true;
  return evaluateSet(
    { condition: rule.condition ?? "ALL", rules: rule.rules },
    answers
  );
}

function evaluateSet(
  set: { condition: "ALL" | "ANY"; rules: VisibilityRuleClause[] },
  answers: Record<string, AnswerValue>
): boolean {
  if (set.rules.length === 0) {
    // Vacuous truth for ALL; a non-empty requirement for ANY.
    return set.condition === "ALL";
  }
  const results = set.rules.map((clause) =>
    isRuleSatisfied(clause, answers[clause.dependsOnQuestionId] ?? null)
  );
  return set.condition === "ANY" ? results.some(Boolean) : results.every(Boolean);
}
