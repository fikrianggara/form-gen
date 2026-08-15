import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { truncateAll } from "./helpers";
import {
  createResponse,
  createResponseWithState,
  getResponseForToken,
  saveResponse,
  listResponses,
  getResponseDetail,
  getQuestionnaireConfig,
} from "@/services/response.service";
import { createQuestionnaire, addQuestion, setQuestionnaireStatus } from "@/services/questionnaire.service";
import { createQuestionMaster, createOptionSet } from "@/services/master-data.service";
import { AppError } from "@/lib/errors";
import type { VisibilityRule } from "@/domain/types";

beforeEach(async () => {
  await truncateAll();
});

const TOKEN = "token-abc-123";

async function buildSurvey(overrides: { slug?: string; single?: boolean } = {}) {
  const q = await createQuestionnaire({
    title: "Survey",
    slug: overrides.slug ?? "survey-x",
    acceptMultipleResponses: !(overrides.single ?? false),
  });

  const name = await createQuestionMaster({ code: "s_name", title: "Name", questionType: "TEXT", requiredDefault: true });
  const age = await createQuestionMaster({ code: "s_age", title: "Age", questionType: "NUMBER" });
  const moodSet = await createOptionSet({
    name: "Mood",
    source: "STATIC",
    options: [
      { label: "Happy", value: "happy" },
      { label: "Sad", value: "sad" },
    ],
  });
  const mood = await createQuestionMaster({ code: "s_mood", title: "Mood", questionType: "RADIO", optionSetId: moodSet.id, requiredDefault: true });
  const note = await createQuestionMaster({ code: "s_note", title: "Note", questionType: "TEXTAREA", requiredDefault: true });

  const qName = await addQuestion({ questionnaireId: q.id, questionMasterId: name.id, required: true });
  const qAge = await addQuestion({ questionnaireId: q.id, questionMasterId: age.id, required: false });
  const qMood = await addQuestion({ questionnaireId: q.id, questionMasterId: mood.id, required: true });
  const qNote = await addQuestion({ questionnaireId: q.id, questionMasterId: note.id, required: true });
  return { q, qName, qAge, qMood, qNote };
}

describe("response service — lifecycle", () => {
  it("creates a draft response with progress 0", async () => {
    const { q } = await buildSurvey();
    await setQuestionnaireStatus(q.id, "ACTIVE");
    const resp = await createResponse(q.id, TOKEN, "Respondent One");
    expect(resp.status).toBe("DRAFT");
    expect(resp.progress).toBe(0);
    expect(resp.respondentLabel).toBe("Respondent One");
  });

  it("returns the existing response for a single-response questionnaire", async () => {
    const { q } = await buildSurvey({ slug: "single-1", single: true });
    await setQuestionnaireStatus(q.id, "ACTIVE");
    const first = await createResponse(q.id, TOKEN);
    const second = await createResponse(q.id, TOKEN);
    expect(second.id).toBe(first.id);
  });

  it("creates a second response when multiple are allowed", async () => {
    const { q } = await buildSurvey({ slug: "multi-1" });
    await setQuestionnaireStatus(q.id, "ACTIVE");
    const first = await createResponse(q.id, TOKEN);
    const second = await createResponse(q.id, TOKEN);
    expect(second.id).not.toBe(first.id);
  });

  it("blocks creating responses for non-ACTIVE questionnaires", async () => {
    const { q } = await buildSurvey({ slug: "draft-1" });
    await expect(createResponse(q.id, TOKEN)).rejects.toThrow(/active/i);
    await setQuestionnaireStatus(q.id, "ACTIVE");
    await expect(createResponse(q.id, TOKEN)).resolves.toBeTruthy();
    await setQuestionnaireStatus(q.id, "CLOSED");
    await expect(createResponse(q.id, TOKEN)).rejects.toThrow(/active|closed/i);
  });

  it("resumes a draft via getResponseForToken", async () => {
    const { q, qName } = await buildSurvey({ slug: "resume-1" });
    await setQuestionnaireStatus(q.id, "ACTIVE");
    const resp = await createResponse(q.id, TOKEN);
    await saveResponse(resp.id, {
      answers: [{ questionId: qName.id, value: "Alice" }],
    });
    const resumed = await getResponseForToken(q.id, TOKEN);
    expect(resumed?.id).toBe(resp.id);
    const detail = await getResponseDetail(resp.id);
    const nameAnswer = detail?.answers.find((a) => a.questionId === qName.id);
    expect(nameAnswer?.textValue).toBe("Alice");
  });
});

describe("response service — lazy create with current state (TKT-001)", () => {
  it("creates the response AND persists the current answers atomically on first save", async () => {
    const { q, qName, qMood, qNote } = await buildSurvey({ slug: "lazy-1" });
    await setQuestionnaireStatus(q.id, "ACTIVE");

    const resp = await createResponseWithState(q.id, TOKEN, "a@example.com", {
      status: "DRAFT",
      answers: [
        { questionId: qName.id, value: "Alice" },
        { questionId: qMood.id, value: "happy" },
        { questionId: qNote.id, value: "hello" },
      ],
    });

    expect(resp.status).toBe("DRAFT");
    // The current state was saved with the row — no blank data.
    const detail = await getResponseDetail(resp.id);
    expect(detail?.answers).toHaveLength(3);
    expect(detail?.answers.find((a) => a.questionId === qName.id)?.textValue).toBe("Alice");
    expect(detail?.answers.find((a) => a.questionId === qMood.id)?.textValue).toBe("happy");
    expect(detail?.answers.find((a) => a.questionId === qNote.id)?.textValue).toBe("hello");
    // Only ONE response row exists for the token.
    const all = await db.response.findMany({ where: { questionnaireId: q.id, respondentToken: TOKEN } });
    expect(all).toHaveLength(1);
  });

  it("computes progress from the saved state on lazy create", async () => {
    const { q, qName } = await buildSurvey({ slug: "lazy-prog-1" });
    await setQuestionnaireStatus(q.id, "ACTIVE");
    const resp = await createResponseWithState(q.id, TOKEN, "a@example.com", {
      status: "DRAFT",
      answers: [{ questionId: qName.id, value: "Alice" }],
    });
    expect(resp.progress).toBe(33);
  });

  it("rejects lazy completion when a required visible answer is missing", async () => {
    const { q, qName } = await buildSurvey({ slug: "lazy-miss-1" });
    await setQuestionnaireStatus(q.id, "ACTIVE");
    await expect(
      createResponseWithState(q.id, TOKEN, "a@example.com", {
        status: "SUBMITTED",
        answers: [{ questionId: qName.id, value: "Alice" }],
      })
    ).rejects.toThrow(/required/i);
  });
});

describe("response service — progress & completion", () => {
  it("computes progress from required visible answers", async () => {
    const { q, qName } = await buildSurvey({ slug: "prog-1" });
    await setQuestionnaireStatus(q.id, "ACTIVE");
    const resp = await createResponse(q.id, TOKEN);
    // 3 required visible (name, mood, note) -> 1/3 answered = 33
    await saveResponse(resp.id, { answers: [{ questionId: qName.id, value: "Alice" }] });
    const updated = await db.response.findUnique({ where: { id: resp.id } });
    expect(updated?.progress).toBe(33);
  });

  it("completes when all required visible answers exist", async () => {
    const { q, qName, qMood, qNote } = await buildSurvey({ slug: "done-1" });
    await setQuestionnaireStatus(q.id, "ACTIVE");
    const resp = await createResponse(q.id, TOKEN);
    const completed = await saveResponse(resp.id, {
      status: "SUBMITTED",
      answers: [
        { questionId: qName.id, value: "Alice" },
        { questionId: qMood.id, value: "happy" },
        { questionId: qNote.id, value: "hi" },
      ],
    });
    expect(completed?.status).toBe("SUBMITTED");
    expect(completed?.progress).toBe(100);
    expect(completed?.completedAt).toBeTruthy();
    // TKT-024: respondent submission leaves an audit record.
    const audits = await db.responseAudit.findMany({ where: { responseId: resp.id } });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actorType: "RESPONDENT", action: "SUBMIT" });
  });

  it("rejects completion when a required visible answer is missing", async () => {
    const { q, qName } = await buildSurvey({ slug: "miss-1" });
    await setQuestionnaireStatus(q.id, "ACTIVE");
    const resp = await createResponse(q.id, TOKEN);
    await expect(
      saveResponse(resp.id, {
        status: "SUBMITTED",
        answers: [{ questionId: qName.id, value: "Alice" }],
      })
    ).rejects.toThrow(/required/i);
  });

  it("rejects saving to a submitted response (respondent immutability)", async () => {
    const { q, qName, qMood, qNote } = await buildSurvey({ slug: "immut-1" });
    await setQuestionnaireStatus(q.id, "ACTIVE");
    const resp = await createResponse(q.id, TOKEN);
    await saveResponse(resp.id, {
      status: "SUBMITTED",
      answers: [
        { questionId: qName.id, value: "Alice" },
        { questionId: qMood.id, value: "happy" },
        { questionId: qNote.id, value: "hi" },
      ],
    });
    await expect(
      saveResponse(resp.id, { answers: [{ questionId: qName.id, value: "Bob" }] })
    ).rejects.toThrow(/no longer editable/i);
  });

  it("ignores hidden questions for required validation", async () => {
    const q = await createQuestionnaire({ title: "Cond", slug: "cond-1" });
    const mYes = await createOptionSet({ name: "YN", source: "STATIC", options: [{ label: "Yes", value: "yes" }, { label: "No", value: "no" }] });
    const mSwitch = await createQuestionMaster({ code: "c_switch", title: "Switch", questionType: "RADIO", optionSetId: mYes.id, requiredDefault: true });
    const mDetail = await createQuestionMaster({ code: "c_detail", title: "Detail", questionType: "TEXT", requiredDefault: true });
    const mOther = await createQuestionMaster({ code: "c_other", title: "Other", questionType: "TEXT" });
    const qSwitch = await addQuestion({ questionnaireId: q.id, questionMasterId: mSwitch.id, required: true });
    const qDetail = await addQuestion({ questionnaireId: q.id, questionMasterId: mDetail.id, required: true });
    await addQuestion({ questionnaireId: q.id, questionMasterId: mOther.id, required: false });
    const rule: VisibilityRule = {
      condition: "ALL",
      rules: [{ dependsOnQuestionId: qSwitch.id, operator: "EQ", value: "yes" }],
    };
    await db.questionnaireQuestion.update({ where: { id: qDetail.id }, data: { visibilityRule: rule as never } });
    await setQuestionnaireStatus(q.id, "ACTIVE");

    const resp = await createResponse(q.id, TOKEN);
    // Switch = no → Detail is hidden → completion succeeds without Detail.
    const completed = await saveResponse(resp.id, {
      status: "SUBMITTED",
      answers: [{ questionId: qSwitch.id, value: "no" }],
    });
    expect(completed?.status).toBe("SUBMITTED");
    expect(completed?.progress).toBe(100);
  });
});

describe("response service — repeatable groups & aggregates", () => {
  it("stores repeatable rows and persists a computed SUM aggregate", async () => {
    const q = await createQuestionnaire({ title: "Exp", slug: "exp-1" });
    const mItem = await createQuestionMaster({ code: "e_item", title: "Item", questionType: "TEXT" });
    const mAmount = await createQuestionMaster({ code: "e_amount", title: "Amount", questionType: "NUMBER", requiredDefault: true });
    const mTotal = await createQuestionMaster({ code: "e_total", title: "Total", questionType: "NUMBER" });

    const qGroup = await addQuestion({ questionnaireId: q.id, questionMasterId: mItem.id, isRepeatable: true });
    const qAmount = await addQuestion({ questionnaireId: q.id, questionMasterId: mAmount.id, parentId: qGroup.id, required: true });
    await addQuestion({ questionnaireId: q.id, questionMasterId: mItem.id, parentId: qGroup.id });
    const qTotal = await addQuestion({
      questionnaireId: q.id,
      questionMasterId: mTotal.id,
      isAggregate: true,
      aggregateConfig: { type: "SUM", sourceQuestionId: qAmount.id },
    });
    await setQuestionnaireStatus(q.id, "ACTIVE");

    const resp = await createResponse(q.id, TOKEN);
    const saved = await saveResponse(resp.id, {
      status: "SUBMITTED",
      groups: [
        {
          parentQuestionId: qGroup.id,
          rows: [
            [{ questionId: qAmount.id, value: 100 }],
            [{ questionId: qAmount.id, value: 250 }],
          ],
        },
      ],
    });
    expect(saved?.status).toBe("SUBMITTED");

    const detail = await getResponseDetail(resp.id);
    const total = detail?.answers.find((a) => a.questionId === qTotal.id);
    expect(total?.isComputed).toBe(true);
    expect(total?.numberValue).toBe(350);

    const groups = await db.answerGroup.findMany({ where: { responseId: resp.id }, orderBy: { rowIndex: "asc" } });
    expect(groups).toHaveLength(2);
  });

  it("aggregate over a flat source sums the single value", async () => {
    const q = await createQuestionnaire({ title: "Flat", slug: "flat-1" });
    const mBase = await createQuestionMaster({ code: "f_base", title: "Base", questionType: "NUMBER" });
    const mDouble = await createQuestionMaster({ code: "f_double", title: "Double", questionType: "NUMBER" });
    const qBase = await addQuestion({ questionnaireId: q.id, questionMasterId: mBase.id });
    const qDouble = await addQuestion({
      questionnaireId: q.id,
      questionMasterId: mDouble.id,
      isAggregate: true,
      aggregateConfig: { type: "SUM", sourceQuestionId: qBase.id },
    });
    await setQuestionnaireStatus(q.id, "ACTIVE");
    const resp = await createResponse(q.id, TOKEN);
    await saveResponse(resp.id, { answers: [{ questionId: qBase.id, value: 42 }] });
    const detail = await getResponseDetail(resp.id);
    const doubled = detail?.answers.find((a) => a.questionId === qDouble.id);
    expect(doubled?.numberValue).toBe(42);
  });
});

describe("response service — config & listing", () => {
  it("returns questionnaire config with ordered questions and options", async () => {
    const { q, qName } = await buildSurvey({ slug: "cfg-1" });
    await setQuestionnaireStatus(q.id, "ACTIVE");
    const config = await getQuestionnaireConfig("cfg-1");
    expect(config?.title).toBe("Survey");
    expect(config?.questions.length).toBe(4);
    expect(config?.questions[0]?.id).toBe(qName.id);
    const mood = config?.questions.find((x) => x.questionMaster.questionType === "RADIO");
    expect(mood?.options?.items.length).toBe(2);
  });

  it("lists responses with status and progress", async () => {
    const { q, qName } = await buildSurvey({ slug: "list-1" });
    await setQuestionnaireStatus(q.id, "ACTIVE");
    await createResponse(q.id, TOKEN);
    const list = await listResponses(q.id);
    expect(list.length).toBe(1);
    expect(list[0]?.status).toBe("DRAFT");
  });
});
