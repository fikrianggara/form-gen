import { notFound } from "next/navigation";
import { getQuestionnaireWithQuestions } from "@/services/questionnaire.service";
import {
  listQuestionMasters,
  listAllMasterVersions,
  listAllOptionSetVersions,
} from "@/services/master-data.service";
import { listSamplingFrame } from "@/services/sampling-frame.service";
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
  optionSetId: string | null;
  blockId: string | null;
  questionMaster: {
    id: string;
    code: string;
    title: string;
    description: string | null;
    questionType: string;
  };
  /** Option set family the master is pinned to (for the version picker). */
  masterOptionSetName: string | null;
  children: EditorQuestion[];
}

export default async function EditQuestionnairePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { generated?: string; matches?: string; low?: string };
}) {
  const [questionnaire, masters, masterVersions, optionSets, samplingFrame] =
    await Promise.all([
      getQuestionnaireWithQuestions(params.id),
      listQuestionMasters(),
      listAllMasterVersions(),
      listAllOptionSetVersions(),
      listSamplingFrame(params.id),
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
      optionSetId: q.optionSetId,
      blockId: q.blockId,
      questionMaster: {
        id: q.questionMaster.id,
        code: q.questionMaster.code,
        title: q.questionMaster.title,
        description: q.questionMaster.description,
        questionType: q.questionMaster.questionType,
      },
      masterOptionSetName: q.questionMaster.optionSet?.name ?? null,
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
        optionSetId: c.optionSetId,
        blockId: c.blockId,
        questionMaster: {
          id: c.questionMaster.id,
          code: c.questionMaster.code,
          title: c.questionMaster.title,
          description: c.questionMaster.description,
          questionType: c.questionMaster.questionType,
        },
        masterOptionSetName: c.questionMaster.optionSet?.name ?? null,
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
        sampleEmails: Array.isArray(questionnaire.sampleEmails)
          ? (questionnaire.sampleEmails as string[])
          : [],
        slug: questionnaire.slug,
      }}
      questions={questions}
      blocks={(questionnaire.blocks ?? []).map((b) => ({
        id: b.id,
        title: b.title,
        order: b.order,
        entryRule: b.entryRule as VisibilityRule | null,
      }))}
      masters={masters.map((m) => ({
        id: m.id,
        code: m.code,
        title: m.title,
        questionType: m.questionType,
        requiredDefault: m.requiredDefault,
        optionSetId: m.optionSetId,
        optionSetName: m.optionSet?.name ?? null,
      }))}
      masterVersions={masterVersions.map((m) => ({
        id: m.id,
        code: m.code,
        version: m.version,
        title: m.title,
        isLatest: m.isLatest,
        questionType: m.questionType,
      }))}
      optionSets={optionSets.map((o) => ({
        id: o.id,
        name: o.name,
        version: o.version,
        isLatest: o.isLatest,
        source: o.source,
      }))}
      samplingFrame={samplingFrame.map((e) => ({
        id: e.id,
        organizationName: e.organizationName,
        contact: e.contact,
        contactType: e.contactType as "EMAIL" | "PHONE",
        rowIndex: e.rowIndex,
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
