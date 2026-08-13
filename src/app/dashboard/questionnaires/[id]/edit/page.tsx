import { notFound } from "next/navigation";
import { getQuestionnaireWithQuestions } from "@/services/questionnaire.service";
import { listQuestionMasters } from "@/services/master-data.service";
import { Editor } from "@/components/dashboard/Editor";
import type { VisibilityRule, AggregateConfig } from "@/domain/types";

export const dynamic = "force-dynamic";

export interface EditorQuestion {
  id: string;
  order: number;
  required: boolean;
  isRepeatable: boolean;
  isAggregate: boolean;
  parentId: string | null;
  visibilityRule: VisibilityRule | null;
  aggregateConfig: AggregateConfig | null;
  aiSuggested: boolean;
  aiConfidence: number | null;
  aiLowConfidence: boolean;
  questionMaster: {
    id: string;
    code: string;
    title: string;
    questionType: string;
  };
  children: EditorQuestion[];
}

export default async function EditQuestionnairePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { generated?: string; matches?: string; low?: string };
}) {
  const [questionnaire, masters] = await Promise.all([
    getQuestionnaireWithQuestions(params.id),
    listQuestionMasters(),
  ]);
  if (!questionnaire) notFound();

  const questions: EditorQuestion[] = questionnaire.questions
    .filter((q) => q.parentId === null)
    .map((q) => ({
      id: q.id,
      order: q.order,
      required: q.required,
      isRepeatable: q.isRepeatable,
      isAggregate: q.isAggregate,
      parentId: q.parentId,
      visibilityRule: (q.visibilityRule as VisibilityRule | null) ?? null,
      aggregateConfig: (q.aggregateConfig as AggregateConfig | null) ?? null,
      aiSuggested: q.aiSuggested,
      aiConfidence: q.aiConfidence,
      aiLowConfidence: q.aiLowConfidence,
      questionMaster: {
        id: q.questionMaster.id,
        code: q.questionMaster.code,
        title: q.questionMaster.title,
        questionType: q.questionMaster.questionType,
      },
      children: q.children.map((c) => ({
        id: c.id,
        order: c.order,
        required: c.required,
        isRepeatable: c.isRepeatable,
        isAggregate: c.isAggregate,
        parentId: c.parentId,
        visibilityRule: (c.visibilityRule as VisibilityRule | null) ?? null,
        aggregateConfig: (c.aggregateConfig as AggregateConfig | null) ?? null,
        aiSuggested: c.aiSuggested,
        aiConfidence: c.aiConfidence,
        aiLowConfidence: c.aiLowConfidence,
        questionMaster: {
          id: c.questionMaster.id,
          code: c.questionMaster.code,
          title: c.questionMaster.title,
          questionType: c.questionMaster.questionType,
        },
        children: [],
      })),
    }));

  return (
    <Editor
      questionnaire={{
        id: questionnaire.id,
        title: questionnaire.title,
        description: questionnaire.description,
        status: questionnaire.status,
        acceptMultipleResponses: questionnaire.acceptMultipleResponses,
        slug: questionnaire.slug,
      }}
      questions={questions}
      masters={masters.map((m) => ({
        id: m.id,
        code: m.code,
        title: m.title,
        questionType: m.questionType,
        requiredDefault: m.requiredDefault,
      }))}
      generatedBanner={
        searchParams.generated === "1"
          ? {
              matchCount: Number(searchParams.matches ?? 0),
              lowCount: Number(searchParams.low ?? 0),
            }
          : null
      }
    />
  );
}
