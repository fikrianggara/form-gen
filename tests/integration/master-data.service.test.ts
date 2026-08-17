import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { truncateAll } from "./helpers";
import {
  createQuestionMaster,
  updateQuestionMaster,
  deleteQuestionMaster,
  listQuestionMasters,
  getQuestionMasterHistory,
  publishQuestionMaster,
  rejectQuestionMaster,
  setQuestionMasterPublic,
  visibleMasterWhere,
  createOptionSet,
  updateOptionSet,
  deleteOptionSet,
  listOptionSets,
  getOptionSetHistory,
} from "@/services/master-data.service";
import { AppError } from "@/lib/errors";
import { createQuestionnaire, addQuestion } from "@/services/questionnaire.service";
import { createUser } from "@/services/user.service";

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

  it("never creates a version with a blank name", async () => {
    const set = await createOptionSet({ name: "RealName", source: "STATIC", options: [{ label: "A", value: "a" }] });
    // A blank/whitespace name must fall back to the existing name.
    const updated = await updateOptionSet(set.id, { name: "   " });
    expect(updated.name).toBe("RealName");
    const all = await db.optionSet.findMany({ where: { name: "RealName" } });
    expect(all).toHaveLength(1); // no-op: no new version
  });

  it("renames via a new version while keeping the same family", async () => {
    const set = await createOptionSet({ name: "OldName", source: "STATIC", options: [{ label: "A", value: "a" }] });
    const renamed = await updateOptionSet(set.id, { name: "NewName" });
    expect(renamed.name).toBe("NewName");
    expect(renamed.familyId).toBe(set.familyId);
    // Old version keeps its name; family stays intact.
    const old = await db.optionSet.findUnique({ where: { id: set.id } });
    expect(old?.name).toBe("OldName");
    const family = await db.optionSet.findMany({ where: { familyId: set.familyId } });
    expect(family.map((f) => f.name).sort()).toEqual(["NewName", "OldName"]);
    // Deleting the family removes BOTH names — recreate with either is then fine.
    await deleteOptionSet(renamed.id);
    expect(await db.optionSet.count({ where: { familyId: set.familyId } })).toBe(0);
    const recreated = await createOptionSet({ name: "OldName", source: "STATIC", options: [] });
    expect(recreated.name).toBe("OldName");
  });

  it("rejects a rename that collides with another family's name", async () => {
    await createOptionSet({ name: "Taken", source: "STATIC", options: [] });
    const set = await createOptionSet({ name: "Renamer", source: "STATIC", options: [] });
    await expect(updateOptionSet(set.id, { name: "Taken" })).rejects.toMatchObject({
      code: "NAME_TAKEN",
    });
  });

  it("names the master questions blocking a delete", async () => {
    const set = await createOptionSet({
      name: "Blocked",
      source: "STATIC",
      options: [{ label: "A", value: "a" }],
    });
    await createQuestionMaster({
      code: "q_blocked",
      title: "Blocked question",
      questionType: "RADIO",
      optionSetId: set.id,
    });
    await expect(deleteOptionSet(set.id)).rejects.toThrow(/Blocked question \(q_blocked\)/);
  });

  it("hard-deletes: recreating the same name after delete succeeds", async () => {
    const set = await createOptionSet({ name: "Cycle", source: "STATIC", options: [{ label: "A", value: "a" }] });
    await deleteOptionSet(set.id);
    const again = await createOptionSet({ name: "Cycle", source: "STATIC", options: [] });
    expect(again.name).toBe("Cycle");
    expect(again.version).toBe(1);
  });
});

describe("master visibility + PENDING workflow (TKT-008)", () => {
  it("creates a PENDING master owned by the creator", async () => {
    const user = await createUser({ email: "op@example.com", name: "Op", password: "Secret123!", role: "OPERATOR" });
    const m = await createQuestionMaster({
      code: "q_novel",
      title: "Novel question",
      questionType: "TEXT",
      createdBy: user.id,
      status: "PENDING",
    });
    expect(m.status).toBe("PENDING");
    expect(m.createdBy).toBe(user.id);
    expect(m.isPublic).toBe(false);
  });

  it("admins see all masters including PENDING", async () => {
    const admin = await createUser({ email: "admin@example.com", name: "Admin", password: "Secret123!", role: "ADMIN" });
    const other = await createUser({ email: "op2@example.com", name: "Op2", password: "Secret123!", role: "OPERATOR" });
    await createQuestionMaster({ code: "q_bank", title: "Bank", questionType: "TEXT" });
    await createQuestionMaster({ code: "q_pending", title: "Pending", questionType: "TEXT", createdBy: other.id, status: "PENDING" });

    const adminView = await listQuestionMasters({ userId: admin.id, role: "ADMIN" });
    expect(adminView.map((m) => m.code)).toEqual(expect.arrayContaining(["q_bank", "q_pending"]));
  });

  it("operators see legacy bank + own PENDING, but not other operators' PENDING", async () => {
    const owner = await createUser({ email: "owner@example.com", name: "Owner", password: "Secret123!", role: "OPERATOR" });
    const other = await createUser({ email: "other@example.com", name: "Other", password: "Secret123!", role: "OPERATOR" });
    // Legacy (no owner) = published bank.
    await createQuestionMaster({ code: "q_legacy", title: "Legacy", questionType: "TEXT" });
    // Owner's own PENDING suggestion is visible to them.
    await createQuestionMaster({ code: "q_mine", title: "Mine", questionType: "TEXT", createdBy: owner.id, status: "PENDING" });
    // Another operator's PENDING is NOT visible.
    await createQuestionMaster({ code: "q_theirs", title: "Theirs", questionType: "TEXT", createdBy: other.id, status: "PENDING" });

    const view = await listQuestionMasters({ userId: owner.id, role: "OPERATOR" });
    const codes = view.map((m) => m.code);
    expect(codes).toContain("q_legacy");
    expect(codes).toContain("q_mine");
    expect(codes).not.toContain("q_theirs");
  });

  it("operators see an admin-created PUBLISHED master", async () => {
    const admin = await createUser({ email: "admin2@example.com", name: "Admin2", password: "Secret123!", role: "ADMIN" });
    const op = await createUser({ email: "op3@example.com", name: "Op3", password: "Secret123!", role: "OPERATOR" });
    await createQuestionMaster({ code: "q_adminmade", title: "Admin made", questionType: "TEXT", createdBy: admin.id });

    const view = await listQuestionMasters({ userId: op.id, role: "OPERATOR" });
    expect(view.map((m) => m.code)).toContain("q_adminmade");
  });

  it("a non-public master created by another operator stays hidden even when PUBLISHED", async () => {
    const owner = await createUser({ email: "owner2@example.com", name: "Owner2", password: "Secret123!", role: "OPERATOR" });
    const other = await createUser({ email: "other2@example.com", name: "Other2", password: "Secret123!", role: "OPERATOR" });
    await createQuestionMaster({ code: "q_private", title: "Private", questionType: "TEXT", createdBy: other.id, status: "PUBLISHED" });

    const view = await listQuestionMasters({ userId: owner.id, role: "OPERATOR" });
    expect(view.map((m) => m.code)).not.toContain("q_private");
  });

  it("opt-in public visibility exposes a master to other operators", async () => {
    const owner = await createUser({ email: "owner3@example.com", name: "Owner3", password: "Secret123!", role: "OPERATOR" });
    const other = await createUser({ email: "other3@example.com", name: "Other3", password: "Secret123!", role: "OPERATOR" });
    const m = await createQuestionMaster({ code: "q_public", title: "Public", questionType: "TEXT", createdBy: other.id, status: "PUBLISHED" });
    await setQuestionMasterPublic(m.id, true);

    const view = await listQuestionMasters({ userId: owner.id, role: "OPERATOR" });
    expect(view.map((x) => x.code)).toContain("q_public");
  });

  it("publish moves a PENDING master into the bank", async () => {
    const user = await createUser({ email: "op4@example.com", name: "Op4", password: "Secret123!", role: "OPERATOR" });
    const m = await createQuestionMaster({ code: "q_pub", title: "To publish", questionType: "TEXT", createdBy: user.id, status: "PENDING" });
    const published = await publishQuestionMaster(m.id);
    expect(published.status).toBe("PUBLISHED");
  });

  it("reject deletes a PENDING master only", async () => {
    const user = await createUser({ email: "op5@example.com", name: "Op5", password: "Secret123!", role: "OPERATOR" });
    const pending = await createQuestionMaster({ code: "q_rej", title: "Reject me", questionType: "TEXT", createdBy: user.id, status: "PENDING" });
    await rejectQuestionMaster(pending.id);
    expect(await db.questionMaster.findUnique({ where: { id: pending.id } })).toBeNull();

    const published = await createQuestionMaster({ code: "q_keep", title: "Keep", questionType: "TEXT" });
    await expect(rejectQuestionMaster(published.id)).rejects.toMatchObject({ code: "NOT_PENDING" });
  });

  it("visibleMasterWhere returns an empty filter for admins", () => {
    expect(visibleMasterWhere({ userId: "u", role: "ADMIN" })).toEqual({});
  });

  it("visibleMasterWhere never exposes another operator's private master to an operator", () => {
    const where = visibleMasterWhere({ userId: "me", role: "OPERATOR" });
    expect(where).not.toEqual({});
  });
});
