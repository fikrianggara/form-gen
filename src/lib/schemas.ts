import { z } from "zod";

export const answerInputSchema = z.object({
  questionId: z.string().min(1),
  value: z.union([z.string(), z.number(), z.array(z.string())]).nullable(),
});

export const groupInputSchema = z.object({
  parentQuestionId: z.string().min(1),
  rows: z.array(z.array(answerInputSchema)),
});

export const saveResponseSchema = z.object({
  token: z.string().min(8).max(128),
  status: z.enum(["DRAFT", "COMPLETED"]).optional(),
  answers: z.array(answerInputSchema).optional().default([]),
  groups: z.array(groupInputSchema).optional().default([]),
  respondentLabel: z.string().max(200).nullable().optional(),
});

/** Shapes of the visibility rule / aggregate config accepted from the builder UI. */
export const visibilityRuleSchema = z.object({
  condition: z.enum(["ALL", "ANY"]),
  rules: z.array(
    z.object({
      dependsOnQuestionId: z.string().min(1),
      operator: z.enum(["EQ", "NEQ", "GT", "GTE", "LT", "LTE", "CONTAINS", "ANY_OF", "NONE_OF"]),
      value: z.union([z.string(), z.number(), z.array(z.string())]),
    })
  ),
});

export const aggregateConfigSchema = z.object({
  type: z.literal("SUM"),
  sourceQuestionId: z.string().min(1),
});
