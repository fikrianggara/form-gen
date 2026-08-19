import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { truncateAll } from "./helpers";
import { createUser } from "@/services/user.service";
import { createQuestionnaire, listQuestionnaires } from "@/services/questionnaire.service";
import {
  createOrganization,
  listOrganizations,
  updateOrganization,
  assignUserOrganization,
  listOrganizationUsers,
  createSurvey,
  listSurveys,
  connectQuestionnaireToSurveys,
  listQuestionnaireSurveys,
  setSurveyQuestionnaires,
  disconnectSurveyQuestionnaire,
  deleteSurvey,
  listConnectableQuestionnaires,
} from "@/services/org.service";
import {
  assertCanManageQuestionnaire,
  assertCanAccessSurvey,
} from "@/services/access-control.service";
import { listQuestionMasters, createQuestionMaster } from "@/services/master-data.service";
import { createProposal } from "@/services/proposal.service";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { AppError } from "@/lib/errors";
import type { Role } from "@prisma/client";

beforeEach(async () => {
  await truncateAll();
});

function principal(id: string, role: Role, organizationId: string | null = null) {
  return { sub: id, email: "x@example.com", name: "X", role, organizationId };
}

describe("organization service (TKT-014)", () => {
  it("creates an organization with a unique slug", async () => {
    const org = await createOrganization({ name: "BPS Pusat" });
    expect(org.slug).toBe("bps-pusat");

    await expect(createOrganization({ name: "BPS Pusat" })).rejects.toBeInstanceOf(AppError);
  });

  it("lists organizations with user and survey counts", async () => {
    const orgA = await createOrganization({ name: "Org A" });
    const orgB = await createOrganization({ name: "Org B" });
    await createSurvey({ organizationId: orgA.id, name: "Sensus 2026" });
    const user = await createUser({
      email: "a@example.com",
      name: "A",
      password: "Secret123!",
      role: "OPERATOR",
    });
    await assignUserOrganization(user.id, orgA.id);

    const orgs = await listOrganizations();
    expect(orgs).toHaveLength(2);
    const a = orgs.find((o) => o.id === orgA.id);
    expect(a?._count.surveys).toBe(1);
    expect(a?._count.users).toBe(1);
    expect(orgs.find((o) => o.id === orgB.id)?._count.surveys).toBe(0);
  });

  it("updates an organization name and description", async () => {
    const org = await createOrganization({ name: "Old Name" });
    const updated = await updateOrganization(org.id, { name: "New Name", description: "desc" });
    expect(updated.name).toBe("New Name");
    expect(updated.description).toBe("desc");
  });

  it("assigns and clears a user's organization", async () => {
    const org = await createOrganization({ name: "Org" });
    const user = await createUser({
      email: "u@example.com",
      name: "U",
      password: "Secret123!",
      role: "OPERATOR",
    });
    await assignUserOrganization(user.id, org.id);
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).organizationId).toBe(org.id);

    await assignUserOrganization(user.id, null);
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).organizationId).toBeNull();
  });

  it("lists users belonging to an organization", async () => {
    const org = await createOrganization({ name: "Org" });
    const other = await createOrganization({ name: "Other" });
    const a = await createUser({ email: "a@example.com", name: "A", password: "Secret123!", role: "OPERATOR" });
    const b = await createUser({ email: "b@example.com", name: "B", password: "Secret123!", role: "OPERATOR" });
    await assignUserOrganization(a.id, org.id);
    await assignUserOrganization(b.id, other.id);

    const users = await listOrganizationUsers(org.id);
    expect(users.map((u) => u.id)).toEqual([a.id]);
  });

  it("creates a survey under an organization", async () => {
    const org = await createOrganization({ name: "Org" });
    const survey = await createSurvey({ organizationId: org.id, name: "Sensus 2026" });
    expect(survey.organizationId).toBe(org.id);
    expect(survey.name).toBe("Sensus 2026");
  });

  it("rejects a survey for an unknown organization", async () => {
    await expect(createSurvey({ organizationId: "missing", name: "X" })).rejects.toBeInstanceOf(
      NotFoundError
    );
  });

  it("lists surveys per organization", async () => {
    const orgA = await createOrganization({ name: "Org A" });
    const orgB = await createOrganization({ name: "Org B" });
    await createSurvey({ organizationId: orgA.id, name: "S1" });
    await createSurvey({ organizationId: orgA.id, name: "S2" });
    await createSurvey({ organizationId: orgB.id, name: "S3" });

    expect(await listSurveys(orgA.id)).toHaveLength(2);
    expect(await listSurveys(orgB.id)).toHaveLength(1);
  });

  it("connects a questionnaire to surveys (replace-set) and detaches", async () => {
    const org = await createOrganization({ name: "Org" });
    const surveyA = await createSurvey({ organizationId: org.id, name: "A" });
    const surveyB = await createSurvey({ organizationId: org.id, name: "B" });
    const q = await createQuestionnaire({ title: "Q", slug: "q-survey" });

    await connectQuestionnaireToSurveys(q.id, [surveyA.id, surveyB.id]);
    let links = await db.surveyQuestionnaire.findMany({ where: { questionnaireId: q.id } });
    expect(links.map((l) => l.surveyId).sort()).toEqual([surveyA.id, surveyB.id].sort());

    // Replace-set: B dropped, C added.
    const surveyC = await createSurvey({ organizationId: org.id, name: "C" });
    await connectQuestionnaireToSurveys(q.id, [surveyA.id, surveyC.id]);
    links = await db.surveyQuestionnaire.findMany({ where: { questionnaireId: q.id } });
    expect(links.map((l) => l.surveyId).sort()).toEqual([surveyA.id, surveyC.id].sort());

    // Detach everything (legacy flat).
    await connectQuestionnaireToSurveys(q.id, []);
    links = await db.surveyQuestionnaire.findMany({ where: { questionnaireId: q.id } });
    expect(links).toHaveLength(0);
  });

  it("rejects connecting to a survey that does not exist", async () => {
    const org = await createOrganization({ name: "Org" });
    const q = await createQuestionnaire({ title: "Q", slug: "q-missing" });
    await expect(connectQuestionnaireToSurveys(q.id, ["missing-survey"])).rejects.toThrow();
  });

  it("lists the surveys using a questionnaire (M2M)", async () => {
    const org = await createOrganization({ name: "Org" });
    const surveyA = await createSurvey({ organizationId: org.id, name: "A" });
    const surveyB = await createSurvey({ organizationId: org.id, name: "B" });
    const q = await createQuestionnaire({ title: "Q", slug: "q-tags" });

    await connectQuestionnaireToSurveys(q.id, [surveyA.id, surveyB.id]);
    const surveys = await listQuestionnaireSurveys(q.id);
    expect(surveys.map((s) => s.id).sort()).toEqual([surveyA.id, surveyB.id].sort());
  });

  it("sets a survey's questionnaire set from the survey side (replace-set)", async () => {
    const org = await createOrganization({ name: "Org" });
    const survey = await createSurvey({ organizationId: org.id, name: "S" });
    const qA = await createQuestionnaire({ title: "A", slug: "qa" });
    const qB = await createQuestionnaire({ title: "B", slug: "qb" });
    const qC = await createQuestionnaire({ title: "C", slug: "qc" });

    await setSurveyQuestionnaires(survey.id, [qA.id, qB.id]);
    await setSurveyQuestionnaires(survey.id, [qB.id, qC.id]);
    const links = await db.surveyQuestionnaire.findMany({ where: { surveyId: survey.id } });
    expect(links.map((l) => l.questionnaireId).sort()).toEqual([qB.id, qC.id].sort());
  });

  it("disconnects a questionnaire but keeps the questionnaire itself", async () => {
    const org = await createOrganization({ name: "Org" });
    const survey = await createSurvey({ organizationId: org.id, name: "S" });
    const qA = await createQuestionnaire({ title: "A", slug: "qa2" });
    const qB = await createQuestionnaire({ title: "B", slug: "qb2" });
    await setSurveyQuestionnaires(survey.id, [qA.id, qB.id]);

    await disconnectSurveyQuestionnaire(survey.id, qA.id);
    const links = await db.surveyQuestionnaire.findMany({ where: { surveyId: survey.id } });
    expect(links.map((l) => l.questionnaireId)).toEqual([qB.id]);
    expect(await db.questionnaire.findUnique({ where: { id: qA.id } })).not.toBeNull();
  });

  it("deletes a survey, keeps its questionnaires, and nulls proposal.surveyId", async () => {
    const org = await createOrganization({ name: "Org" });
    const survey = await createSurvey({ organizationId: org.id, name: "S" });
    const qA = await createQuestionnaire({ title: "A", slug: "qa3" });
    const qB = await createQuestionnaire({ title: "B", slug: "qb3" });
    await setSurveyQuestionnaires(survey.id, [qA.id, qB.id]);
    const proposalOwner = await createUser({ email: "proposal-owner@example.com", name: "PO", password: "Secret123!", role: "OPERATOR" });
    const proposal = await createProposal({
      organizationId: org.id,
      createdBy: proposalOwner.id,
      title: "P",
    });
    await db.proposal.update({ where: { id: proposal.id }, data: { surveyId: survey.id } });

    await deleteSurvey(survey.id);

    expect(await db.survey.findUnique({ where: { id: survey.id } })).toBeNull();
    expect(await db.surveyQuestionnaire.count({ where: { surveyId: survey.id } })).toBe(0);
    expect(await db.questionnaire.count({ where: { id: { in: [qA.id, qB.id] } } })).toBe(2);
    expect((await db.proposal.findUniqueOrThrow({ where: { id: proposal.id } })).surveyId).toBeNull();
  });

  it("scopes the connectable-questionnaire picker to what the operator can manage", async () => {
    const orgA = await createOrganization({ name: "Org A" });
    const orgB = await createOrganization({ name: "Org B" });
    const op = await createUser({ email: "op-picker@example.com", name: "Op", password: "Secret123!", role: "OPERATOR" });
    await assignUserOrganization(op.id, orgA.id);
    const own = await createQuestionnaire({ title: "Own", slug: "own", createdBy: op.id });
    const legacy = await createQuestionnaire({ title: "Legacy", slug: "legacy" });
    const inOrgA = await createQuestionnaire({ title: "InA", slug: "ina" });
    const otherUser = await createUser({ email: "other@example.com", name: "Other", password: "Secret123!", role: "OPERATOR" });
    const inOrgB = await createQuestionnaire({ title: "InB", slug: "inb", createdBy: otherUser.id });
    const surveyA = await createSurvey({ organizationId: orgA.id, name: "SA" });
    const surveyB = await createSurvey({ organizationId: orgB.id, name: "SB" });
    await connectQuestionnaireToSurveys(inOrgA.id, [surveyA.id]);
    await connectQuestionnaireToSurveys(inOrgB.id, [surveyB.id]);

    const adminPick = await listConnectableQuestionnaires({ sub: "admin", email: "a@x", name: "A", role: "ADMIN", organizationId: null });
    expect(adminPick.map((q) => q.id).sort()).toEqual([own.id, legacy.id, inOrgA.id, inOrgB.id].sort());

    const opPick = await listConnectableQuestionnaires({ sub: op.id, email: "op@x", name: "Op", role: "OPERATOR", organizationId: orgA.id });
    expect(opPick.map((q) => q.id).sort()).toEqual([own.id, legacy.id, inOrgA.id].sort());
  });

  it("returns survey tags (with org) for the questionnaire list (TKT-043, no N+1)", async () => {
    const org = await createOrganization({ name: "Tag Org" });
    const survey = await createSurvey({ organizationId: org.id, name: "Tag Survey" });
    const q = await createQuestionnaire({ title: "Tagged", slug: "tagged" });
    await connectQuestionnaireToSurveys(q.id, [survey.id]);

    const list = await listQuestionnaires();
    const row = list.find((x) => x.id === q.id);
    expect(row?.surveys).toHaveLength(1);
    expect(row?.surveys[0].survey.name).toBe("Tag Survey");
    expect(row?.surveys[0].survey.organization?.name).toBe("Tag Org");
  });
});

describe("org-scoped access control (TKT-014)", () => {
  async function orgWithSurvey(name: string) {
    const org = await createOrganization({ name });
    const survey = await createSurvey({ organizationId: org.id, name: `${name} Survey` });
    return { org, survey };
  }

  it("allows an operator to manage questionnaires in their org's survey", async () => {
    const { org, survey } = await orgWithSurvey("Org A");
    const creator = await createUser({ email: "creator@example.com", name: "Creator", password: "Secret123!", role: "OPERATOR" });
    const op = await createUser({ email: "op@example.com", name: "Op", password: "Secret123!", role: "OPERATOR" });
    const q = await createQuestionnaire({ title: "Q", slug: "q-same-org", createdBy: creator.id });
    await connectQuestionnaireToSurveys(q.id, [survey.id]);

    await expect(
      assertCanManageQuestionnaire(principal(op.id, "OPERATOR", org.id), q.id)
    ).resolves.not.toThrow();
  });

  it("forbids an operator from another org's questionnaire", async () => {
    const { org, survey } = await orgWithSurvey("Org A");
    const creator = await createUser({ email: "creator2@example.com", name: "Creator", password: "Secret123!", role: "OPERATOR" });
    const otherOrg = await createOrganization({ name: "Org B" });
    const op = await createUser({ email: "op2@example.com", name: "Op", password: "Secret123!", role: "OPERATOR" });
    const q = await createQuestionnaire({ title: "Q", slug: "q-other-org", createdBy: creator.id });
    await connectQuestionnaireToSurveys(q.id, [survey.id]);

    await expect(
      assertCanManageQuestionnaire(principal(op.id, "OPERATOR", otherOrg.id), q.id)
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("allows an operator when ANY of the questionnaire's surveys is in their org (TKT-041 M2M)", async () => {
    const { org, survey } = await orgWithSurvey("Org A");
    const otherOrg = await createOrganization({ name: "Org B" });
    const otherSurvey = await createSurvey({ organizationId: otherOrg.id, name: "Org B Survey" });
    const creator = await createUser({ email: "creator3@example.com", name: "Creator", password: "Secret123!", role: "OPERATOR" });
    const opB = await createUser({ email: "opb@example.com", name: "OpB", password: "Secret123!", role: "OPERATOR" });
    const q = await createQuestionnaire({ title: "Q", slug: "q-any-org", createdBy: creator.id });
    // Connected to org A's survey AND org B's survey.
    await connectQuestionnaireToSurveys(q.id, [survey.id, otherSurvey.id]);

    await expect(
      assertCanManageQuestionnaire(principal(opB.id, "OPERATOR", otherOrg.id), q.id)
    ).resolves.not.toThrow();
  });

  it("still allows the creator of an org questionnaire", async () => {
    const { org, survey } = await orgWithSurvey("Org A");
    const owner = await createUser({ email: "owner@example.com", name: "Owner", password: "Secret123!", role: "OPERATOR" });
    const q = await createQuestionnaire({ title: "Q", slug: "q-owner-org", createdBy: owner.id });
    await connectQuestionnaireToSurveys(q.id, [survey.id]);

    await expect(
      assertCanManageQuestionnaire(principal(owner.id, "OPERATOR", org.id), q.id)
    ).resolves.not.toThrow();
  });

  it("allows access to a survey in the same org and forbids cross-org", async () => {
    const { org, survey } = await orgWithSurvey("Org A");
    const otherOrg = await createOrganization({ name: "Org B" });
    const op = await createUser({ email: "op3@example.com", name: "Op", password: "Secret123!", role: "OPERATOR" });

    await expect(
      assertCanAccessSurvey(principal(op.id, "OPERATOR", org.id), survey.id)
    ).resolves.not.toThrow();
    await expect(
      assertCanAccessSurvey(principal(op.id, "OPERATOR", otherOrg.id), survey.id)
    ).rejects.toBeInstanceOf(ForbiddenError);
    // ADMIN always allowed
    await expect(
      assertCanAccessSurvey(principal(op.id, "ADMIN", otherOrg.id), survey.id)
    ).resolves.not.toThrow();
  });
});

describe("master scoping (TKT-014)", () => {
  it("scopes masters to own org + public + legacy, and admin sees all", async () => {
    const orgA = await createOrganization({ name: "Org A" });
    const orgB = await createOrganization({ name: "Org B" });

    const own = await createQuestionMaster({
      code: "OWN", title: "Own", questionType: "TEXT",
      organizationId: orgA.id, isPublic: false,
    });
    const publicB = await createQuestionMaster({
      code: "PUB", title: "Public from B", questionType: "TEXT",
      organizationId: orgB.id, isPublic: true,
    });
    const privateB = await createQuestionMaster({
      code: "PRIV", title: "Private from B", questionType: "TEXT",
      organizationId: orgB.id, isPublic: false,
    });
    const legacy = await createQuestionMaster({
      code: "LEG", title: "Legacy", questionType: "TEXT",
      organizationId: null, isPublic: false,
    });

    const scoped = await listQuestionMasters({ userId: "op-1", role: "OPERATOR", organizationId: orgA.id });
    const codes = scoped.map((m) => m.code).sort();
    expect(codes).toContain("OWN");
    expect(codes).toContain("PUB");
    expect(codes).toContain("LEG");
    expect(codes).not.toContain("PRIV");

    const all = await listQuestionMasters({ userId: "admin", role: "ADMIN" });
    expect(all.map((m) => m.code)).toContain("PRIV");
  });
});
