import type { AggregateConfig } from "@/domain/types";

/**
 * Sum a list of numeric values, skipping nulls.
 * Returns null when there is nothing to sum (no values or all null),
 * which the caller treats as "no aggregate computed yet".
 */
export function sumValues(values: Array<number | null>): number | null {
  const present = values.filter((v): v is number => v !== null && v !== undefined);
  if (present.length === 0) return null;
  return present.reduce((acc, v) => acc + v, 0);
}

/**
 * Sum one question's numeric values across a set of rows
 * (each row = one repeatable-group instance mapping questionId -> value).
 * Returns null when no row carries a value for the source question.
 */
export function sumSourceAcrossRows(
  sourceQuestionId: string,
  rows: Array<Record<string, number | null>>
): number | null {
  return sumValues(rows.map((row) => row[sourceQuestionId] ?? null));
}

/**
 * Compute the value of an aggregate question from a map of
 * sourceQuestionId -> list of numeric values (one entry per row).
 * v1 supports SUM only; unknown types return null.
 */
export function computeAggregate(
  config: AggregateConfig,
  sourceValues: Record<string, Array<number | null>>
): number | null {
  if (config.type !== "SUM") return null;
  const values = sourceValues[config.sourceQuestionId];
  if (!values) return null;
  return sumValues(values);
}
