/**
 * Pure statistics for questionnaire reports. No I/O — trivially unit-testable.
 *
 * Inputs are deliberately minimal (status/progress/createdAt, answer values)
 * so callers can pass plain shapes from any data source.
 */
import type { AnswerValue } from "@/domain/types";

export interface ResponseLike {
  status: string;
  progress: number;
  createdAt: Date | string;
}

export interface CompletionStats {
  total: number;
  completed: number;
  drafts: number;
  /** completed / total, rounded percent. */
  completionRate: number;
  /** mean progress across all responses, rounded. */
  averageProgress: number;
}

export function computeCompletionStats(responses: ResponseLike[]): CompletionStats {
  const total = responses.length;
  const completed = responses.filter((r) => r.status === "COMPLETED").length;
  return {
    total,
    completed,
    drafts: total - completed,
    completionRate: total === 0 ? 0 : Math.round((completed / total) * 100),
    averageProgress:
      total === 0 ? 0 : Math.round(responses.reduce((s, r) => s + r.progress, 0) / total),
  };
}

export interface DailyCount {
  /** yyyy-mm-dd (UTC day). */
  date: string;
  count: number;
}

/**
 * Response counts per UTC day for the last `days` days (inclusive of today),
 * with zero-filled gaps so the caller can render a stable chart.
 */
export function dailyResponseCounts(
  responses: ResponseLike[],
  days = 14,
  now = new Date()
): DailyCount[] {
  const counts = new Map<string, number>();
  for (const r of responses) {
    const d = new Date(r.createdAt);
    if (Number.isNaN(d.getTime())) continue;
    const key = toUtcDateKey(d);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const out: DailyCount[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(now);
    day.setUTCHours(0, 0, 0, 0);
    day.setUTCDate(day.getUTCDate() - i);
    const key = toUtcDateKey(day);
    out.push({ date: key, count: counts.get(key) ?? 0 });
  }
  return out;
}

function toUtcDateKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface ChoiceStat {
  value: string;
  label: string;
  count: number;
  /** count / total selections, percent with one decimal. */
  percent: number;
}

/**
 * Distribution of selected option values. CHECKBOX values contribute one entry
 * per selected item. Unknown values (external API options, legacy data) keep
 * their raw value as label when no matching option is supplied.
 */
export function buildChoiceDistribution(
  values: AnswerValue[],
  options?: Array<{ label: string; value: string }> | null
): ChoiceStat[] {
  const labelOf = new Map(options?.map((o) => [o.value, o.label]) ?? []);
  const counts = new Map<string, number>();
  let total = 0;
  for (const v of values) {
    const items = Array.isArray(v) ? v : v === null || v === undefined ? [] : [v];
    for (const item of items) {
      const key = String(item);
      if (key === "") continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      total++;
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value, count]) => ({
      value,
      label: labelOf.get(value) ?? value,
      count,
      percent: total === 0 ? 0 : Math.round((count / total) * 1000) / 10,
    }));
}

export interface NumericStat {
  count: number;
  min: number;
  max: number;
  avg: number;
  sum: number;
}

/** Mean/min/max/sum over non-null numbers; null when nothing to compute. */
export function computeNumericStats(values: Array<number | null>): NumericStat | null {
  const nums = values.filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
  if (nums.length === 0) return null;
  const sum = nums.reduce((a, b) => a + b, 0);
  return {
    count: nums.length,
    min: Math.min(...nums),
    max: Math.max(...nums),
    avg: Math.round((sum / nums.length) * 100) / 100,
    sum: Math.round(sum * 100) / 100,
  };
}
