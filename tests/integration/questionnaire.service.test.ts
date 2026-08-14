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
  updateQuestionMasterVersion,
  updateQuestionOptionSet,
  duplicateQuestionnaire,
} from "@/services/questionnaire.service";
import { createQuestionMaster, createOptionSet, updateOptionSet, deleteOptionSet, updateQuestionMaster } from "@/services/master-data.service";
import { getQuestionnaireConfig } from "@/services/response.service";
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

  it("rejects a visibility rule that references a missing question", async () => {
    const q = await createQuestionnaire({ title: "Q", slug: "qq-rule-missing" });
    const m = await makeTextMaster("q_rule_missing_dep");
    const qa = await addQuestion({ questionnaireId: q.id, questionMasterId: m.id });
    await expect(
      updateQuestionSettings(qa.id, {
        visibilityRule: {
          sets: [
            { condition: "ALL", rules: [{ operator: "EQ", value: "x", dependsOnQuestionId: "ghost" }] },
          ],
        },
      })
    ).rejects.toThrow(/ghost/);
  });

  it("rejects a self-referencing visibility rule", async () => {
    const q = await createQuestionnaire({ title: "Q", slug: "qq-rule-self" });
    const m = await makeTextMaster("q_rule_self_dep");
    const qa = await addQuestion({ questionnaireId: q.id, questionMasterId: m.id });
    await expect(
      updateQuestionSettings(qa.id, {
        visibilityRule: {
          sets: [
            { condition: "ALL", rules: [{ operator: "EQ", value: "x", dependsOnQuestionId: qa.id }] },
          ],
        },
      })
    ).rejects.toThrow(/itself/);
  });

  it("rejects a dependency cycle across questions", async () => {
    const q = await createQuestionnaire({ title: "Q", slug: "qq-rule-cycle" });
    const m1 = await makeTextMaster("q_rule_cycle_a");
    const m2 = await makeTextMaster("q_rule_cycle_b");
    const qa = await addQuestion({ questionnaireId: q.id, questionMasterId: m1.id });
    const qb = await addQuestion({ questionnaireId: q.id, questionMasterId: m2.id });
    await updateQuestionSettings(qa.id, {
      visibilityRule: {
        sets: [{ condition: "ALL", rules: [{ operator: "EQ", value: "x", dependsOnQuestionId: qb.id }] }],
      },
    });
    await expect(
      updateQuestionSettings(qb.id, {
        visibilityRule: {
          sets: [{ condition: "ALL", rules: [{ operator: "EQ", value: "x", dependsOnQuestionId: qa.id }] }],
        },
      })
    ).rejects.toThrow(/cycle/);
  });

  it("persists a multi-set visibility rule and round-trips it through the config", async () => {
    const q = await createQuestionnaire({ title: "Q", slug: "qq-rule-multi" });
    const m1 = await makeRadioMaster("q_rule_multi_a");
    const m2 = await makeTextMaster("q_rule_multi_b");
    const qa = await addQuestion({ questionnaireId: q.id, questionMasterId: m1.id });
    const qb = await addQuestion({ questionnaireId: q.id, questionMasterId: m2.id });
    const rule: import("@/domain/types").VisibilityRule = {
      sets: [
        { condition: "ALL", rules: [{ operator: "EQ", value: "yes", dependsOnQuestionId: qa.id }] },
        { condition: "ANY", rules: [{ operator: "EQ", value: "x", dependsOnQuestionId: qa.id }] },
      ],
    };
    const updated = await updateQuestionSettings(qb.id, { visibilityRule: rule });
    expect(updated.visibilityRule).toEqual(rule);
    const config = await getQuestionnaireConfig(q.slug);
    const qbConfig = config.questions.find((x) => x.id === qb.id);
    expect(qbConfig?.visibilityRule).toEqual(rule);
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

describe("version selection and duplication", () => {
  it("adds a question pinned to a specific option set version (override)", async () => {
    const set = await createOptionSet({
      name: "Versioned Set",
      source: "STATIC",
      options: [{ label: "A", value: "a" }],
    });
    const setV2 = await updateOptionSet(set.id, {
      name: "Versioned Set",
      options: [
        { label: "A", value: "a" },
        { label: "B", value: "b" },
      ],
    });
    const master = await createQuestionMaster({
      code: "q_ver_radio",
      title: "Versioned radio",
      questionType: "RADIO",
      optionSetId: set.id, // v1
    });
    const q = await createQuestionnaire({ title: "V", slug: "ver-1" });
    const placed = await addQuestion({
      questionnaireId: q.id,
      questionMasterId: master.id,
      optionSetId: setV2.id,
    });
    expect(placed.optionSetId).toBe(setV2.id);
    const config = await getQuestionnaireConfig("ver-1");
    const options = config?.questions[0]?.options;
    expect(options?.optionSetId).toBe(setV2.id);
    expect(options?.items.map((o) => o.value)).toEqual(["a", "b"]);
  });

  it("effective option set falls back to the master's pinned version", async () => {
    const set = await createOptionSet({
      name: "Fallback Set",
      source: "STATIC",
      options: [{ label: "X", value: "x" }],
    });
    const master = await createQuestionMaster({
      code: "q_fb_radio",
      title: "Fallback radio",
      questionType: "RADIO",
      optionSetId: set.id,
    });
    const q = await createQuestionnaire({ title: "F", slug: "fb-1" });
    await addQuestion({ questionnaireId: q.id, questionMasterId: master.id });
    const config = await getQuestionnaireConfig("fb-1");
    expect(config?.questions[0]?.options?.optionSetId).toBe(set.id);
  });

  it("re-pins a placed question to another master version", async () => {
    const master = await createQuestionMaster({ code: "q_repin", title: "V1", questionType: "TEXT" });
    const v2 = await updateQuestionMaster(master.id, { title: "V2" });
    const q = await createQuestionnaire({ title: "R", slug: "repin-1" });
    const placed = await addQuestion({ questionnaireId: q.id, questionMasterId: master.id });
    const updated = await updateQuestionMasterVersion(placed.id, v2.id);
    expect(updated.questionMasterId).toBe(v2.id);
    const loaded = await getQuestionnaireWithQuestions(q.id);
    expect(loaded?.questions[0]?.questionMaster.title).toBe("V2");
  });

  it("rejects a master version that would duplicate another placed question", async () => {
    const master = await createQuestionMaster({ code: "q_dup", title: "D", questionType: "TEXT" });
    const other = await createQuestionMaster({ code: "q_other", title: "O", questionType: "TEXT" });
    const q = await createQuestionnaire({ title: "D", slug: "dup-1" });
    await addQuestion({ questionnaireId: q.id, questionMasterId: master.id });
    const placed2 = await addQuestion({
      questionnaireId: q.id,
      questionMasterId: other.id,
    });
    // Re-pinning placed2 to the master already used at the same level must fail.
    await expect(updateQuestionMasterVersion(placed2.id, master.id)).rejects.toThrow();
  });

  it("sets and clears the per-question option set override", async () => {
    const set = await createOptionSet({ name: "OS", source: "STATIC", options: [{ label: "A", value: "a" }] });
    const setV2 = await updateOptionSet(set.id, { name: "OS", options: [{ label: "A", value: "a" }, { label: "B", value: "b" }] });
    const master = await createQuestionMaster({ code: "q_os", title: "OS q", questionType: "RADIO", optionSetId: set.id });
    const q = await createQuestionnaire({ title: "O", slug: "os-1" });
    const placed = await addQuestion({ questionnaireId: q.id, questionMasterId: master.id });
    const withOverride = await updateQuestionOptionSet(placed.id, setV2.id);
    expect(withOverride.optionSetId).toBe(setV2.id);
    const cleared = await updateQuestionOptionSet(placed.id, null);
    expect(cleared.optionSetId).toBeNull();
  });

  it("duplicates a questionnaire preserving structure, rules and flags", async () => {
    const set = await createOptionSet({ name: "DupSet", source: "STATIC", options: [{ label: "A", value: "a" }] });
    const master = await createQuestionMaster({ code: "q_dup1", title: "Dup master", questionType: "RADIO", optionSetId: set.id });
    const childMaster = await createQuestionMaster({ code: "q_dup2", title: "Child", questionType: "TEXT" });
    const depMaster = await createQuestionMaster({ code: "q_dup3", title: "Dep", questionType: "TEXT" });
    const q = await createQuestionnaire({ title: "Original", slug: "orig-1", acceptMultipleResponses: false });
    const parent = await addQuestion({
      questionnaireId: q.id,
      questionMasterId: master.id,
      isRepeatable: true,
    });
    const dep = await addQuestion({
      questionnaireId: q.id,
      questionMasterId: depMaster.id,
    });
    // A real rule on the parent depending on `dep`.
    const parentRule = {
      sets: [
        { condition: "ALL", rules: [{ dependsOnQuestionId: dep.id, operator: "EQ", value: "yes" }] },
      ],
    };
    await updateQuestionSettings(parent.id, { visibilityRule: parentRule });
    await addQuestion({
      questionnaireId: q.id,
      questionMasterId: childMaster.id,
      parentId: parent.id,
      required: true,
      optionSetId: set.id,
    });
    await setQuestionnaireStatus(q.id, "ACTIVE");

    const { questionnaire: copy, questionCount } = await duplicateQuestionnaire(q.id);
    expect(copy.title).toBe("Original (copy)");
    expect(copy.status).toBe("DRAFT");
    expect(copy.slug).not.toBe(q.slug);
    expect(copy.acceptMultipleResponses).toBe(false);
    expect(questionCount).toBe(3);

    const loaded = await getQuestionnaireWithQuestions(copy.id);
    const parentCopy = loaded?.questions.find((x) => x.isRepeatable);
    const depCopy = loaded?.questions.find((x) => !x.isRepeatable && x.parentId === null && !x.isAggregate);
    expect(parentCopy).toBeTruthy();
    expect(parentCopy?.children).toHaveLength(1);
    expect(parentCopy?.children[0]?.required).toBe(true);
    expect(parentCopy?.children[0]?.optionSetId).toBe(set.id);
    // The copied rule must reference the COPIED dependency id, not the original.
    expect(depCopy).toBeTruthy();
    expect(parentCopy?.visibilityRule).toEqual({
      sets: [{ condition: "ALL", rules: [{ dependsOnQuestionId: depCopy!.id, operator: "EQ", value: "yes" }] }],
    });
    expect((parentCopy?.visibilityRule as any)?.sets?.[0]?.rules?.[0]?.dependsOnQuestionId).not.toBe(dep.id);

    // Original untouched.
    const original = await getQuestionnaireWithQuestions(q.id);
    expect(original?.status).toBe("ACTIVE");
    expect(original?.questions.filter((x) => x.parentId === null)).toHaveLength(2);
  });

  it("duplicates with a unique slug each time", async () => {
    const master = await createQuestionMaster({ code: "q_dup3", title: "D3", questionType: "TEXT" });
    const q = await createQuestionnaire({ title: "Slug", slug: "slug-1" });
    await addQuestion({ questionnaireId: q.id, questionMasterId: master.id });
    const first = await duplicateQuestionnaire(q.id);
    const second = await duplicateQuestionnaire(q.id);
    expect(first.questionnaire.slug).toBe("slug-1-copy");
    expect(second.questionnaire.slug).toBe("slug-1-copy-2");
  });

  it("blocks deleting an option set referenced directly by a placed question", async () => {
    const set = await createOptionSet({ name: "Guarded", source: "STATIC", options: [{ label: "A", value: "a" }] });
    const master = await createQuestionMaster({ code: "q_guard", title: "G", questionType: "RADIO", optionSetId: set.id });
    const q = await createQuestionnaire({ title: "G", slug: "guard-1" });
    await addQuestion({ questionnaireId: q.id, questionMasterId: master.id, optionSetId: set.id });
    await expect(deleteOptionSet(set.id)).rejects.toThrow(/used/);
  });
});
