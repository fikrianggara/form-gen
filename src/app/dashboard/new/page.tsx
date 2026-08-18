import NewQuestionnaireForm from "@/components/dashboard/NewQuestionnaireForm";

export default function NewQuestionnairePage({
  searchParams,
}: {
  searchParams: { surveyId?: string; title?: string };
}) {
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-4 text-2xl font-bold">Create questionnaire</h1>
      {searchParams.surveyId && (
        <p className="mb-4 rounded-lg bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
          Building a questionnaire for an approved proposal — it will be attached to the
          proposal&apos;s survey.
        </p>
      )}
      <NewQuestionnaireForm
        initialTitle={searchParams.title}
        surveyId={searchParams.surveyId}
      />
    </div>
  );
}
