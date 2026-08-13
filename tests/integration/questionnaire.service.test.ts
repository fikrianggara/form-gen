import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { truncateAll } from "./helpers";
import {
  createQuestionnaire,
  updateQuestionnaire,
  setQuestionnaireStatus,
  listQuestionnaires,
  getQuestionnaireWithQuestions,
  addQuestion,
  updateQuestionSettings,
  removeQuestion,
  reorderQuestions,
} from "@/services/questionnaire.service";
import { createQuestionMaster, createOptionSet } from "@/services/master-data.service";
import type { QuestionnaireStatus } from "@prisma/client";

beforeEach(async () => {
  await truncateAll();
});

async function makeTextMaster(code = "q_text") {
  return createQuestionMaster({ code, title: "Text", questionType: "TEXT" });
}

async function makeRadioMaster(code = "q_radio") {
  const set = await createOptionSet({
    name: `Set ${code}`,
    source: "STATIC",
    options: [
      { label: "Yes", value: "yes" },
      { label: "No", value: "no" },
    ],
  });
  return createQuestionMaster({
    code,
    title: "Radio",
    questionType: "RADIO",
    optionSetId: set.id,
  });
}

describe("questionnaire service", () => {
  it("creates a questionnaire with defaults", async () => {
    const q = await createQuestionnaire({
      title: "Survey",
      slug: "survey-1",
      acceptMultipleResponses: true,
    });
    expect(q.status).toBe("DRAFT");
    expect(q.acceptMultipleResponses).toBe(true);
  });

  it("rejects duplicate slugs", async () => {
    await createQuestionnaire({ title: "A", slug: "same" });
    await expect(createQuestionnaire({ title: "B", slug: "same" })).rejects.toThrow();
  });

  it("rejects an invalid slug format", async () => {
    await expect(
      createQuestionnaire({ title: "A", slug: "has space & !" })
    ).rejects.toThrow(/slug/i);
  });

  it("updates a questionnaire", async () => {
    const q = await createQuestionnaire({ title: "Old", slug: "q1" });
    const updated = await updateQuestionnaire(q.id, {
      title: "New",
      description: "desc",
      acceptMultipleResponses: false,
    });
    expect(updated.title).toBe("New");
    expect(updated.acceptMultipleResponses).toBe(false);
  });

  it("sets status", async () => {
    const q = await createQuestionnaire({ title: "S", slug: "s1" });
    const active = await setQuestionnaireStatus(q.id, "ACTIVE");
    expect(active.status).toBe("ACTIVE");
    const closed = await setQuestionnaireStatus(q.id, "CLOSED");
    expect(closed.status).toBe("CLOSED");
  });

  it("lists questionnaires", async () => {
    await createQuestionnaire({ title: "A", slug: "a1" });
    await createQuestionnaire({ title: "B", slug: "b1" });
    const all = await listQuestionnaires();
    expect(all.length).toBe(2);
  });

  it("adds questions with increasing order", async () => {
    const q = await createQuestionnaire({ title: "Q", slug: "qq" });
    const m1 = await makeTextMaster("q_one");
    const m2 = await makeTextMaster("q_two");
    const qq1 = await addQuestion({ questionnaireId: q.id, questionMasterId: m1.id, required: true });
    const qq2 = await addQuestion({ questionnaireId: q.id, questionMasterId: m2.id, required: false });
    expect(qq1.order).toBe(1);
    expect(qq2.order).toBe(2);
  });

  it("rejects adding the same master twice in the same group", async () => {
    const q = await createQuestionnaire({ title: "Q", slug: "qq2" });
    const m = await makeTextMaster("q_dup_m");
    await addQuestion({ questionnaireId: q.id, questionMasterId: m.id });
    await expect(addQuestion({ questionnaireId: q.id, questionMasterId: m.id })).rejects.toThrow();
  });

  it("allows the same master in different repeatable groups", async () => {
    const q = await createQuestionnaire({ title: "Q", slug: "qq3" });
    const m = await makeTextMaster("q_multi");
    const group = await addQuestion({
      questionnaireId: q.id,
      questionMasterId: m.id,
      isRepeatable: true,
    });
    await addQuestion({
      questionnaireId: q.id,
      questionMasterId: m.id,
      parentId: group.id,
    });
    // Same master twice is allowed when separated by parent group.
    const count = await db.questionnaireQuestion.count({ where: { questionnaireId: q.id } });
    expect(count).toBe(2);
  });

  it("requires a repeatable parent for child questions", async () => {
    const q = await createQuestionnaire({ title: "Q", slug: "qq4" });
    const m1 = await makeTextMaster("q_parent");
    const m2 = await makeTextMaster("q_child");
    const normal = await addQuestion({ questionnaireId: q.id, questionMasterId: m1.id });
    await expect(
      addQuestion({ questionnaireId: q.id, questionMasterId: m2.id, parentId: normal.id })
    ).rejects.toThrow(/repeatable/i);
  });

  it("rejects a parent from a different questionnaire", async () => {
    const q1 = await createQuestionnaire({ title: "Q1", slug: "qq5" });
    const q2 = await createQuestionnaire({ title: "Q2", slug: "qq6" });
    const m1 = await makeTextMaster("q_other_parent");
    const m2 = await makeTextMaster("q_other_child");
    const group = await addQuestion({ questionnaireId: q1.id, questionMasterId: m1.id, isRepeatable: true });
    await expect(
      addQuestion({ questionnaireId: q2.id, questionMasterId: m2.id, parentId: group.id })
    ).rejects.toThrow(/questionnaire/i);
  });

  it("updates question settings including rules and aggregates", async () => {
    const q = await createQuestionnaire({ title: "Q", slug: "qq7" });
    const m1 = await makeRadioMaster("q_rule_a");
    const m2 = await makeTextMaster("q_rule_b");
    const qa = await addQuestion({ questionnaireId: q.id, questionMasterId: m1.id });
    const qb = await addQuestion({ questionnaireId: q.id, questionMasterId: m2.id });
    const updated = await updateQuestionSettings(qb.id, {
      required: true,
      visibilityRule: {
        condition: "ALL",
        rules: [{ dependsOnQuestionId: qa.id, operator: "EQ", value: "yes" }],
      },
    });
    expect(updated.required).toBe(true);
    expect(updated.visibilityRule).toMatchObject({ condition: "ALL" });
  });

  it("removes a question and its children", async () => {
    const q = await createQuestionnaire({ title: "Q", slug: "qq8" });
    const m1 = await makeTextMaster("q_rm_group");
    const m2 = await makeTextMaster("q_rm_child");
    const group = await addQuestion({ questionnaireId: q.id, questionMasterId: m1.id, isRepeatable: true });
    await addQuestion({ questionnaireId: q.id, questionMasterId: m2.id, parentId: group.id });
    await removeQuestion(group.id);
    const remaining = await db.questionnaireQuestion.count({ where: { questionnaireId: q.id } });
    expect(remaining).toBe(0);
  });

  it("reorders questions", async () => {
    const q = await createQuestionnaire({ title: "Q", slug: "qq9" });
    const m1 = await makeTextMaster("q_r1");
    const m2 = await makeTextMaster("q_r2");
    const m3 = await makeTextMaster("q_r3");
    const a = await addQuestion({ questionnaireId: q.id, questionMasterId: m1.id });
    const b = await addQuestion({ questionnaireId: q.id, questionMasterId: m2.id });
    const c = await addQuestion({ questionnaireId: q.id, questionMasterId: m3.id });
    await reorderQuestions(q.id, [c.id, a.id, b.id]);
    const ordered = await db.questionnaireQuestion.findMany({
      where: { questionnaireId: q.id },
      orderBy: { order: "asc" },
    });
    expect(ordered.map((x) => x.id)).toEqual([c.id, a.id, b.id]);
  });

  it("rejects reorder when ids do not match the questionnaire", async () => {
    const q = await createQuestionnaire({ title: "Q", slug: "qq10" });
    const other = await createQuestionnaire({ title: "O", slug: "qq11" });
    const m1 = await makeTextMaster("q_ro1");
    const m2 = await makeTextMaster("q_ro2");
    const a = await addQuestion({ questionnaireId: q.id, questionMasterId: m1.id });
    await addQuestion({ questionnaireId: other.id, questionMasterId: m2.id });
    await expect(reorderQuestions(q.id, [a.id, "foreign-id"])).rejects.toThrow(/match/i);
  });

  it("loads a questionnaire with ordered questions and masters", async () => {
    const q = await createQuestionnaire({ title: "Q", slug: "qq12" });
    const m1 = await makeTextMaster("q_load1");
    const m2 = await makeRadioMaster("q_load2");
    await addQuestion({ questionnaireId: q.id, questionMasterId: m1.id });
    await addQuestion({ questionnaireId: q.id, questionMasterId: m2.id });
    const loaded = await getQuestionnaireWithQuestions(q.id);
    expect(loaded?.questions.map((x) => x.questionMaster.code)).toEqual(["q_load1", "q_load2"]);
    expect(loaded?.questions[1]?.questionMaster.optionSet).toBeTruthy();
  });
});
