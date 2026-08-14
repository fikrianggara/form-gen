import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { truncateAll } from "./helpers";
import {
  generateInvitations,
  getInvitationByToken,
  markInvitationClicked,
  linkInvitationToResponse,
  INVITATION_TOKEN_LENGTH,
} from "@/services/invitation.service";
import { AppError } from "@/lib/errors";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await db.$disconnect();
});

async function makeQuestionnaire(overrides: { sampleEmails?: string[] } = {}) {
  return db.questionnaire.create({
    data: {
      title: "Sample Survey",
      slug: `sample-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      status: "ACTIVE",
      sampleEmails: (overrides.sampleEmails ?? []) as unknown as object,
    },
  });
}

describe("invitation service", () => {
  it("generates one invitation per sample email with a unique token", async () => {
    const q = await makeQuestionnaire();
    const emails = ["a@example.com", "b@example.com", "c@example.com"];
    const invitations = await generateInvitations(q.id, emails);

    expect(invitations).toHaveLength(3);
    const tokens = new Set(invitations.map((i) => i.token));
    expect(tokens.size).toBe(3);
    expect(invitations.every((i) => i.token.length === INVITATION_TOKEN_LENGTH)).toBe(true);
    expect(invitations.map((i) => i.email).sort()).toEqual([...emails].sort());
  });

  it("does NOT create any Response rows when generating links", async () => {
    const q = await makeQuestionnaire();
    await generateInvitations(q.id, ["a@example.com", "b@example.com"]);

    const responseCount = await db.response.count({ where: { questionnaireId: q.id } });
    expect(responseCount).toBe(0);
  });

  it("dedupes and skips invalid emails", async () => {
    const q = await makeQuestionnaire();
    const invitations = await generateInvitations(q.id, [
      "a@example.com",
      "A@example.com",
      "not-an-email",
      "",
    ]);

    expect(invitations).toHaveLength(1);
    expect(invitations[0].email).toBe("a@example.com");
  });

  it("looks up an invitation by token", async () => {
    const q = await makeQuestionnaire();
    const [inv] = await generateInvitations(q.id, ["a@example.com"]);
    const found = await getInvitationByToken(inv.token);
    expect(found?.email).toBe("a@example.com");
    expect(found?.questionnaireId).toBe(q.id);
  });

  it("returns null for an unknown token", async () => {
    expect(await getInvitationByToken("unknown-token-xyz")).toBeNull();
  });

  it("marks an invitation clicked without creating a response", async () => {
    const q = await makeQuestionnaire();
    const [inv] = await generateInvitations(q.id, ["a@example.com"]);
    expect(inv.clickedAt).toBeNull();

    const marked = await markInvitationClicked(inv.token);
    expect(marked?.clickedAt).toBeTruthy();
    expect(await db.response.count({ where: { questionnaireId: q.id } })).toBe(0);
  });

  it("links an invitation to a lazily-created response", async () => {
    const q = await makeQuestionnaire();
    const [inv] = await generateInvitations(q.id, ["a@example.com"]);

    const response = await db.response.create({
      data: {
        questionnaireId: q.id,
        respondentToken: inv.token,
        respondentLabel: "a@example.com",
        status: "DRAFT",
        progress: 0,
      },
    });

    const linked = await linkInvitationToResponse(inv.token, response.id);
    expect(linked?.responseId).toBe(response.id);
  });

  it("throws AppError for unknown questionnaire", async () => {
    await expect(generateInvitations("missing-id", ["a@example.com"])).rejects.toBeInstanceOf(
      AppError
    );
  });
});
