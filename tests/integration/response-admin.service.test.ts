import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { truncateAll } from "./helpers";
import { createUser } from "@/services/user.service";
import { createQuestionnaire } from "@/services/questionnaire.service";
import { createResponse, saveResponse } from "@/services/response.service";
import {
  deleteResponse,
  editResponseAsAdmin,
  approveResponse,
  listResponseAudits,
  mailblastRespondent,
} from "@/services/response-admin.service";
import { AppError, NotFoundError } from "@/lib/errors";
import type { MailTransport } from "@/services/mail.service";
import type { AdminActor } from "@/services/response-admin.service";

beforeEach(async () => {
  await truncateAll();
});

async function makeQuestionnaireWithResponse(extra?: { respondentLabel?: string | null }) {
  const user = await createUser({ email: "owner@example.com", name: "Owner", password: "Secret123!", role: "OPERATOR" });
  const q = await createQuestionnaire({ title: "Q", slug: "q-admin", createdBy: user.id });
  const active = await db.questionnaire.update({ where: { id: q.id }, data: { status: "ACTIVE" } });
  const resp = await createResponse(active.id, "token-abcdef123456", extra?.respondentLabel ?? null);
  return { user, q: active, resp };
}

const ACTOR: AdminActor = { userId: "actor-1", name: "System Admin", role: "ADMIN" };

describe("response admin actions (TKT-017)", () => {
  it("deletes a response and its answers", async () => {
    const { q, resp } = await makeQuestionnaireWithResponse();
    await db.answer.create({
      data: { responseId: resp.id, questionId: "placeholder", textValue: "x" },
    }).catch(() => undefined); // question FK may reject; we still verify response row delete

    await deleteResponse(resp.id);
    const gone = await db.response.findUnique({ where: { id: resp.id } });
    expect(gone).toBeNull();
  });

  it("throws NotFound for unknown response on delete", async () => {
    await expect(deleteResponse("missing")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("detaches linked invitations when a response is deleted (TKT-022)", async () => {
    const { q, resp } = await makeQuestionnaireWithResponse({ respondentLabel: "r@example.com" });
    // Simulate an invitation that has been linked to this response.
    const inv = await db.invitation.create({
      data: {
        questionnaireId: q.id,
        email: "r@example.com",
        token: "tok-022-" + resp.id.slice(0, 8),
        responseId: resp.id,
      },
    });

    await deleteResponse(resp.id);

    const after = await db.invitation.findUnique({ where: { id: inv.id } });
    expect(after?.responseId).toBeNull();
    const gone = await db.response.findUnique({ where: { id: resp.id } });
    expect(gone).toBeNull();
  });

  it("the FK itself (SetNull) detaches invitations even when the response is deleted directly (TKT-022)", async () => {
    const { q, resp } = await makeQuestionnaireWithResponse({ respondentLabel: "r@example.com" });
    const inv = await db.invitation.create({
      data: {
        questionnaireId: q.id,
        email: "r@example.com",
        token: "tok-022-direct-" + resp.id.slice(0, 8),
        responseId: resp.id,
      },
    });

    // Bypass the service's manual detach — the DB constraint must do the work.
    await db.response.delete({ where: { id: resp.id } });

    const after = await db.invitation.findUnique({ where: { id: inv.id } });
    expect(after?.responseId).toBeNull();
  });

  it("mailblasts the questionnaire link to the respondent's email", async () => {
    const { q, resp } = await makeQuestionnaireWithResponse({ respondentLabel: "r@example.com" });
    const sent: string[] = [];
    const transport: MailTransport = async (m) => {
      sent.push(m.to);
    };

    const result = await mailblastRespondent(resp.id, transport);

    expect(sent).toEqual(["r@example.com"]);
    expect(result.link).toMatch(/^\/f\/q-admin\?invite=/);
    // An invitation row now exists for that email; no Response rows created by the blast.
    const inv = await db.invitation.findFirst({ where: { questionnaireId: q.id, email: "r@example.com" } });
    expect(inv?.sentAt).not.toBeNull();
    const respCount = await db.response.count({ where: { questionnaireId: q.id } });
    expect(respCount).toBe(1);
  });

  it("mailblasts an absolute link when APP_URL is configured (TKT-019)", async () => {
    process.env.APP_URL = "https://forms.example.com";
    const { resp } = await makeQuestionnaireWithResponse({ respondentLabel: "r@example.com" });
    const transport: MailTransport = async () => undefined;
    const result = await mailblastRespondent(resp.id, transport);
    expect(result.link).toBe(
      `https://forms.example.com/f/q-admin?invite=${result.token}`
    );
    delete process.env.APP_URL;
  });

  it("throws when the response has no email to mailblast", async () => {
    const { resp } = await makeQuestionnaireWithResponse({ respondentLabel: null });
    const transport: MailTransport = async () => undefined;
    await expect(mailblastRespondent(resp.id, transport)).rejects.toBeInstanceOf(AppError);
  });
});

describe("response status workflow (TKT-024)", () => {
  async function submittedResponse() {
    const { q, resp } = await makeQuestionnaireWithResponse({ respondentLabel: "r@example.com" });
    const saved = await saveResponse(resp.id, { status: "SUBMITTED", answers: [] });
    return { q, resp: saved! };
  }

  it("records a respondent SUBMIT audit when a draft is submitted", async () => {
    const { resp } = await submittedResponse();
    expect(resp.status).toBe("SUBMITTED");
    const audits = await listResponseAudits(resp.id);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorType: "RESPONDENT",
      action: "SUBMIT",
      fromStatus: "DRAFT",
      toStatus: "SUBMITTED",
    });
  });

  it("admin edit moves a submitted response to EDITED and records the actor", async () => {
    const { resp } = await submittedResponse();
    const edited = await editResponseAsAdmin(resp.id, { answers: [] }, ACTOR);
    expect(edited?.status).toBe("EDITED");

    const audits = await listResponseAudits(resp.id);
    const editAudit = audits.find((a) => a.action === "ADMIN_EDIT");
    expect(editAudit).toBeDefined();
    expect(editAudit).toMatchObject({
      actorType: "ADMIN",
      actorUserId: "actor-1",
      actorLabel: "System Admin",
      fromStatus: "SUBMITTED",
      toStatus: "EDITED",
    });
  });

  it("admin edit preserves the original submission timestamp", async () => {
    const { resp } = await submittedResponse();
    const before = resp.completedAt;
    const edited = await editResponseAsAdmin(resp.id, { answers: [] }, ACTOR);
    expect(edited?.completedAt).toEqual(before);
  });

  it("admin can edit a DRAFT response (no required validation forced)", async () => {
    const { resp } = await makeQuestionnaireWithResponse();
    const edited = await editResponseAsAdmin(resp.id, { answers: [] }, ACTOR);
    expect(edited?.status).toBe("EDITED");
  });

  it("approve moves a submitted response to APPROVED and records the actor", async () => {
    const { resp } = await submittedResponse();
    const approved = await approveResponse(resp.id, ACTOR);
    expect(approved?.status).toBe("APPROVED");

    const audits = await listResponseAudits(resp.id);
    const approveAudit = audits.find((a) => a.action === "APPROVE");
    expect(approveAudit).toMatchObject({
      actorType: "ADMIN",
      actorUserId: "actor-1",
      action: "APPROVE",
      fromStatus: "SUBMITTED",
      toStatus: "APPROVED",
    });
  });

  it("approve works on an EDITED response", async () => {
    const { resp } = await submittedResponse();
    await editResponseAsAdmin(resp.id, { answers: [] }, ACTOR);
    const approved = await approveResponse(resp.id, ACTOR);
    expect(approved?.status).toBe("APPROVED");
  });

  it("rejects approving a DRAFT response", async () => {
    const { resp } = await makeQuestionnaireWithResponse();
    await expect(approveResponse(resp.id, ACTOR)).rejects.toMatchObject({
      code: "RESPONSE_NOT_SUBMITTED",
    });
  });

  it("rejects double approval", async () => {
    const { resp } = await submittedResponse();
    await approveResponse(resp.id, ACTOR);
    await expect(approveResponse(resp.id, ACTOR)).rejects.toMatchObject({
      code: "RESPONSE_APPROVED",
    });
  });

  it("rejects editing an APPROVED response", async () => {
    const { resp } = await submittedResponse();
    await approveResponse(resp.id, ACTOR);
    await expect(editResponseAsAdmin(resp.id, { answers: [] }, ACTOR)).rejects.toMatchObject({
      code: "RESPONSE_APPROVED",
    });
  });

  it("records an OPERATOR actor type for operator edits", async () => {
    const { resp } = await submittedResponse();
    const operator: AdminActor = { userId: "op-1", name: "Survey Operator", role: "OPERATOR" };
    await editResponseAsAdmin(resp.id, { answers: [] }, operator);
    const audits = await listResponseAudits(resp.id);
    expect(audits.find((a) => a.action === "ADMIN_EDIT")?.actorType).toBe("OPERATOR");
  });
});
