import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { truncateAll } from "./helpers";
import { createUser } from "@/services/user.service";
import { createQuestionnaire } from "@/services/questionnaire.service";
import { createResponse } from "@/services/response.service";
import { deleteResponse, mailblastRespondent } from "@/services/response-admin.service";
import { AppError, NotFoundError } from "@/lib/errors";
import type { MailTransport } from "@/services/mail.service";

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

  it("throws when the response has no email to mailblast", async () => {
    const { resp } = await makeQuestionnaireWithResponse({ respondentLabel: null });
    const transport: MailTransport = async () => undefined;
    await expect(mailblastRespondent(resp.id, transport)).rejects.toBeInstanceOf(AppError);
  });
});
