import type { AnswerValue, VisibilityRule, AggregateConfig } from "@/domain/types";

/** Public questionnaire config as served by GET /api/questionnaires/[slug]. */
export interface QuestionnaireConfig {
  id: string;
  title: string;
  description: string | null;
  slug: string;
  status: "DRAFT" | "ACTIVE" | "CLOSED";
  acceptMultipleResponses: boolean;
  blocks: Array<{
    id: string;
    title: string;
    order: number;
    entryRule: VisibilityRule | null;
  }>;
  questions: ConfigQuestion[];
}

export interface ConfigQuestion {
  id: string;
  order: number;
  required: boolean;
  isRepeatable: boolean;
  isAggregate: boolean;
  aggregateConfig: AggregateConfig | null;
  visibilityRule: VisibilityRule | null;
  parentId: string | null;
  blockId: string | null;
  questionMaster: {
    id: string;
    code: string;
    title: string;
    description: string | null;
    questionType:
      | "TEXT"
      | "TEXTAREA"
      | "NUMBER"
      | "DATE"
      | "RADIO"
      | "CHECKBOX"
      | "SELECT"
      | "RATING";
    placeholder: string | null;
    minValue: number | null;
    maxValue: number | null;
    maxLength: number | null;
    ratingMax: number | null;
  };
  options: {
    external: boolean;
    optionSetId: string | null;
    items: Array<{ label: string; value: string }>;
  } | null;
}

/** Response as returned by the public API. */
export interface ResponseDto {
  id: string;
  status: "DRAFT" | "SUBMITTED" | "EDITED" | "APPROVED";
  progress: number;
  completedAt: string | null;
  answers?: Array<{
    questionId: string;
    answerGroupId: string | null;
    textValue: string | null;
    numberValue: number | null;
    dateValue: string | null;
    jsonValue: unknown;
    isComputed: boolean;
  }>;
  answerGroups?: Array<{
    id: string;
    parentQuestionId: string;
    rowIndex: number;
    answers: Array<{
      questionId: string;
      textValue: string | null;
      numberValue: number | null;
      dateValue: string | null;
      jsonValue: unknown;
      isComputed: boolean;
    }>;
  }>;
}

export type { AnswerValue };
