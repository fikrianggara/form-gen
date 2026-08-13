/**
 * Completion progress for a response: the percentage of required,
 * currently-visible questions that have an answer.
 *
 * A questionnaire with no required visible questions is considered
 * complete for progress purposes (100%).
 */
export function calculateProgress(
  requiredVisibleQuestionIds: string[],
  answeredQuestionIds: Set<string>
): number {
  if (requiredVisibleQuestionIds.length === 0) return 100;
  const answered = requiredVisibleQuestionIds.filter((id) =>
    answeredQuestionIds.has(id)
  ).length;
  return Math.round((answered / requiredVisibleQuestionIds.length) * 100);
}
