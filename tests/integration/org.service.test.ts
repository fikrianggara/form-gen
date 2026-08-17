import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { truncateAll } from "./helpers";
import { createUser } from "@/services/user.service";
import { createQuestionnaire } from "@/services/questionnaire.service";
import {
  createOrganization,
  listOrganizations,
  updateOrganization,
  assignUserOrganization,
  listOrganizationUsers,
  createSurvey,
  listSurveys,
  assignQuestionnaireToSurvey,
} from "@/services/org.service";
import {
  assertCanManageQuestionnaire,
  assertCanAccessSurvey,
} from "@/services/access-control.service";
import { listQuestionMasters, createQuestionMaster } from "@/services/master-data.service";
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

  it("assigns a questionnaire to a survey and detaches it", async () => {
    const org = await createOrganization({ name: "Org" });
    const survey = await createSurvey({ organizationId: org.id, name: "S" });
    const q = await createQuestionnaire({ title: "Q", slug: "q-survey" });

    await assignQuestionnaireToSurvey(q.id, survey.id);
    expect((await db.questionnaire.findUniqueOrThrow({ where: { id: q.id } })).surveyId).toBe(survey.id);

    await assignQuestionnaireToSurvey(q.id, null);
    expect((await db.questionnaire.findUniqueOrThrow({ where: { id: q.id } })).surveyId).toBeNull();
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
    await assignQuestionnaireToSurvey(q.id, survey.id);

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
    await assignQuestionnaireToSurvey(q.id, survey.id);

    await expect(
      assertCanManageQuestionnaire(principal(op.id, "OPERATOR", otherOrg.id), q.id)
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("still allows the creator of an org questionnaire", async () => {
    const { org, survey } = await orgWithSurvey("Org A");
    const owner = await createUser({ email: "owner@example.com", name: "Owner", password: "Secret123!", role: "OPERATOR" });
    const q = await createQuestionnaire({ title: "Q", slug: "q-owner-org", createdBy: owner.id });
    await assignQuestionnaireToSurvey(q.id, survey.id);

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
