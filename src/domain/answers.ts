import type { AnswerValue } from "@/domain/types";
import type { QuestionType } from "@prisma/client";

/**
 * Shape of a persisted Answer row, viewed through the fields the domain engine
 * cares about. `jsonValue` carries checkbox selections (string[]).
 */
export interface AnswerLike {
  textValue?: string | null;
  numberValue?: number | null;
  dateValue?: Date | string | null;
  jsonValue?: unknown;
}

/** Format a Date as yyyy-MM-dd (the wire format for DATE answers). */
export function serializeDateValue(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Extract the comparable AnswerValue from a stored Answer row,
 * following the per-type mapping in the technical spec:
 * - TEXT/TEXTAREA/RADIO/SELECT -> textValue
 * - NUMBER/RATING -> numberValue
 * - DATE -> ISO date string (yyyy-MM-dd)
 * - CHECKBOX -> jsonValue as string[]
 */
export function extractAnswerValue(
  questionType: QuestionType,
  answer: AnswerLike | null | undefined
): AnswerValue {
  if (!answer) return null;
  switch (questionType) {
    case "NUMBER":
    case "RATING":
      return typeof answer.numberValue === "number" ? answer.numberValue : null;
    case "DATE": {
      if (!answer.dateValue) return null;
      const d = answer.dateValue instanceof Date ? answer.dateValue : new Date(answer.dateValue);
      return Number.isNaN(d.getTime()) ? null : serializeDateValue(d);
    }
    case "CHECKBOX": {
      if (Array.isArray(answer.jsonValue)) {
        return answer.jsonValue.map(String);
      }
      return null;
    }
    case "TEXT":
    case "TEXTAREA":
    case "RADIO":
    case "SELECT":
    default:
      return typeof answer.textValue === "string" ? answer.textValue : null;
  }
}

/** True when the value counts as "unanswered" for a given question type. */
export function isAnswerEmpty(
  questionType: QuestionType,
  value: AnswerValue
): boolean {
  if (value === null || value === undefined) return true;
  switch (questionType) {
    case "TEXT":
    case "TEXTAREA":
    case "RADIO":
    case "SELECT":
      return typeof value === "string" && value.trim() === "";
    case "CHECKBOX":
      return Array.isArray(value) && value.length === 0;
    case "NUMBER":
    case "RATING":
      return typeof value !== "number" || Number.isNaN(value);
    case "DATE":
      return typeof value !== "string" || value.trim() === "";
    default:
      return true;
  }
}
