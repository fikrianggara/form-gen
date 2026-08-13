import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { truncateAll } from "./helpers";
import {
  createQuestionMaster,
  updateQuestionMaster,
  deleteQuestionMaster,
  listQuestionMasters,
  getQuestionMasterHistory,
  createOptionSet,
  updateOptionSet,
  deleteOptionSet,
  listOptionSets,
  getOptionSetHistory,
} from "@/services/master-data.service";
import { AppError } from "@/lib/errors";
import { createQuestionnaire, addQuestion } from "@/services/questionnaire.service";

beforeEach(async () => {
  await truncateAll();
});

describe("question master service", () => {
  it("creates a text master", async () => {
    const m = await createQuestionMaster({
      code: "q_name",
      title: "Full name",
      questionType: "TEXT",
      requiredDefault: true,
      maxLength: 100,
    });
    expect(m.id).toBeTruthy();
    expect(m.code).toBe("q_name");
    expect(m.requiredDefault).toBe(true);
  });

  it("rejects duplicate codes", async () => {
    await createQuestionMaster({ code: "q_dup", title: "A", questionType: "TEXT" });
    await expect(
      createQuestionMaster({ code: "q_dup", title: "B", questionType: "TEXT" })
    ).rejects.toThrow();
  });

  it("requires an option set for choice types", async () => {
    await expect(
      createQuestionMaster({ code: "q_radio", title: "Pick", questionType: "RADIO" })
    ).rejects.toThrow(/option set/i);
  });

  it("accepts an option set for choice types", async () => {
    const set = await createOptionSet({
      name: "YesNo",
      source: "STATIC",
      options: [
        { label: "Yes", value: "yes" },
        { label: "No", value: "no" },
      ],
    });
    const m = await createQuestionMaster({
      code: "q_radio2",
      title: "Pick",
      questionType: "RADIO",
      optionSetId: set.id,
    });
    expect(m.optionSetId).toBe(set.id);
  });

  it("updates a master by creating a new version", async () => {
    const m = await createQuestionMaster({ code: "q_up", title: "Old", questionType: "TEXT" });
    const updated = await updateQuestionMaster(m.id, { title: "New", requiredDefault: true });
    expect(updated.id).not.toBe(m.id);
    expect(updated.version).toBe(2);
    expect(updated.title).toBe("New");
    expect(updated.requiredDefault).toBe(true);
    const old = await db.questionMaster.findUnique({ where: { id: m.id } });
    expect(old?.title).toBe("Old");
    expect(old?.isLatest).toBe(false);
  });

  it("does not create a version when nothing changed", async () => {
    const m = await createQuestionMaster({ code: "q_noop", title: "Same", questionType: "TEXT" });
    const updated = await updateQuestionMaster(m.id, { title: "Same", questionType: "TEXT" });
    expect(updated.id).toBe(m.id);
    expect(updated.version).toBe(1);
  });

  it("lists only the latest version of each master", async () => {
    const m = await createQuestionMaster({ code: "q_latest", title: "V1", questionType: "TEXT" });
    await updateQuestionMaster(m.id, { title: "V2" });
    const all = await listQuestionMasters();
    const versions = all.filter((x) => x.code === "q_latest");
    expect(versions).toHaveLength(1);
    expect(versions[0]?.title).toBe("V2");
    expect(versions[0]?.version).toBe(2);
  });

  it("preserves history for a master", async () => {
    const m = await createQuestionMaster({ code: "q_hist", title: "H1", questionType: "TEXT" });
    await updateQuestionMaster(m.id, { title: "H2" });
    const history = await getQuestionMasterHistory("q_hist");
    expect(history.map((h) => h.title)).toEqual(["H2", "H1"]);
    expect(history.map((h) => h.version)).toEqual([2, 1]);
  });

  it("deletes all versions of a master", async () => {
    const m = await createQuestionMaster({ code: "q_multi", title: "A", questionType: "TEXT" });
    await updateQuestionMaster(m.id, { title: "B" });
    await deleteQuestionMaster(m.id);
    const remaining = await db.questionMaster.count({ where: { code: "q_multi" } });
    expect(remaining).toBe(0);
  });

  it("keeps only the newest version as latest even when editing an old version", async () => {
    const m = await createQuestionMaster({ code: "q_branch", title: "A", questionType: "TEXT" });
    const v2 = await updateQuestionMaster(m.id, { title: "B" });
    // Branch off the ORIGINAL version again, then edit v2.
    await updateQuestionMaster(m.id, { title: "C" });
    await updateQuestionMaster(v2.id, { title: "D" });
    const versions = await db.questionMaster.findMany({
      where: { code: "q_branch" },
      orderBy: { version: "asc" },
    });
    const latest = versions.filter((v) => v.isLatest);
    expect(latest).toHaveLength(1);
    expect(latest[0]?.version).toBe(4);
    expect(latest[0]?.title).toBe("D");
  });

  it("questionnaires keep the master version they were built with", async () => {
    const m = await createQuestionMaster({ code: "q_pin", title: "V1", questionType: "TEXT" });
    const q = await createQuestionnaire({ title: "Pin", slug: "pin-1" });
    const qq = await addQuestion({ questionnaireId: q.id, questionMasterId: m.id });
    await updateQuestionMaster(m.id, { title: "V2" });
    const loaded = await db.questionnaireQuestion.findUnique({
      where: { id: qq.id },
      include: { questionMaster: true },
    });
    expect(loaded?.questionMaster.id).toBe(m.id);
    expect(loaded?.questionMaster.title).toBe("V1");
    expect(loaded?.questionMaster.version).toBe(1);
  });

  it("deletes a master that is not used", async () => {
    const m = await createQuestionMaster({ code: "q_del", title: "D", questionType: "TEXT" });
    await deleteQuestionMaster(m.id);
    expect(await db.questionMaster.findUnique({ where: { id: m.id } })).toBeNull();
  });

  it("lists masters ordered by code", async () => {
    await createQuestionMaster({ code: "q_b", title: "B", questionType: "TEXT" });
    await createQuestionMaster({ code: "q_a", title: "A", questionType: "TEXT" });
    const all = await listQuestionMasters();
    expect(all.map((m) => m.code)).toEqual(["q_a", "q_b"]);
  });
});

describe("option set service", () => {
  it("creates a static option set with ordered options", async () => {
    const set = await createOptionSet({
      name: "Cities",
      source: "STATIC",
      options: [
        { label: "Jakarta", value: "jkt" },
        { label: "Bandung", value: "bdg" },
      ],
    });
    const withOptions = await db.optionSet.findUnique({
      where: { id: set.id },
      include: { options: { orderBy: { order: "asc" } } },
    });
    expect(withOptions?.options.map((o) => o.value)).toEqual(["jkt", "bdg"]);
  });

  it("creates an external API option set", async () => {
    const set = await createOptionSet({
      name: "External",
      source: "EXTERNAL_API",
      apiUrl: "https://api.example.com/items",
      itemsPath: "data.items",
    });
    expect(set.source).toBe("EXTERNAL_API");
    expect(set.apiUrl).toBe("https://api.example.com/items");
  });

  it("rejects an external option set without a URL", async () => {
    await expect(
      createOptionSet({ name: "Broken", source: "EXTERNAL_API" })
    ).rejects.toThrow(/url/i);
  });

  it("updates an option set by creating a new version with copied options", async () => {
    const set = await createOptionSet({
      name: "UpdateMe",
      source: "STATIC",
      options: [{ label: "A", value: "a" }],
    });
    const updated = await updateOptionSet(set.id, {
      name: "Updated",
      options: [{ label: "B", value: "b" }],
    });
    expect(updated.id).not.toBe(set.id);
    expect(updated.version).toBe(2);
    expect(updated.name).toBe("Updated");
    const newOptions = await db.option.findMany({
      where: { optionSetId: updated.id },
      orderBy: { order: "asc" },
    });
    expect(newOptions.map((o) => o.value)).toEqual(["b"]);
    // Old version keeps its own options.
    const oldOptions = await db.option.findMany({
      where: { optionSetId: set.id },
      orderBy: { order: "asc" },
    });
    expect(oldOptions.map((o) => o.value)).toEqual(["a"]);
    const old = await db.optionSet.findUnique({ where: { id: set.id } });
    expect(old?.isLatest).toBe(false);
  });

  it("does not create an option set version when nothing changed", async () => {
    const set = await createOptionSet({
      name: "NoopSet",
      source: "STATIC",
      options: [{ label: "A", value: "a" }],
    });
    const updated = await updateOptionSet(set.id, {
      name: "NoopSet",
      source: "STATIC",
      options: [{ label: "A", value: "a" }],
    });
    expect(updated.id).toBe(set.id);
    expect(updated.version).toBe(1);
  });

  it("lists only the latest option set version", async () => {
    const set = await createOptionSet({ name: "LatestSet", source: "STATIC", options: [] });
    await updateOptionSet(set.id, { name: "LatestSet", options: [{ label: "X", value: "x" }] });
    const all = await listOptionSets();
    const versions = all.filter((s) => s.name === "LatestSet");
    expect(versions).toHaveLength(1);
    expect(versions[0]?.version).toBe(2);
  });

  it("preserves option set history", async () => {
    const set = await createOptionSet({ name: "HistSet", source: "STATIC", options: [] });
    await updateOptionSet(set.id, { name: "HistSet", options: [{ label: "X", value: "x" }] });
    const history = await getOptionSetHistory("HistSet");
    expect(history.map((h) => h.version)).toEqual([2, 1]);
  });

  it("blocks deleting an option set used by a master", async () => {
    const set = await createOptionSet({
      name: "InUse",
      source: "STATIC",
      options: [{ label: "A", value: "a" }],
    });
    await createQuestionMaster({
      code: "q_uses",
      title: "Uses",
      questionType: "RADIO",
      optionSetId: set.id,
    });
    await expect(deleteOptionSet(set.id)).rejects.toBeInstanceOf(AppError);
  });

  it("deletes an unused option set", async () => {
    const set = await createOptionSet({
      name: "Unused",
      source: "STATIC",
      options: [{ label: "A", value: "a" }],
    });
    await deleteOptionSet(set.id);
    expect(await db.optionSet.findUnique({ where: { id: set.id } })).toBeNull();
  });

  it("lists option sets", async () => {
    await createOptionSet({ name: "One", source: "STATIC", options: [] });
    await createOptionSet({ name: "Two", source: "STATIC", options: [] });
    const all = await listOptionSets();
    expect(all.map((s) => s.name).sort()).toEqual(["One", "Two"]);
  });
});
