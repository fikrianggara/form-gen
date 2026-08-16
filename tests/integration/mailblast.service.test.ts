import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { truncateAll } from "./helpers";
import {
  sendInvitations,
  remindNonRespondents,
} from "@/services/invitation.service";
import { buildInvitationMail } from "@/services/mail.service";
import type { MailTransport } from "@/services/mail.service";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await db.$disconnect();
});

async function makeQuestionnaire(overrides: { sampleEmails?: string[] } = {}) {
  return db.questionnaire.create({
    data: {
      title: "Mailblast Survey",
      slug: `mailblast-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      status: "ACTIVE",
      sampleEmails: (overrides.sampleEmails ?? []) as unknown as object,
    },
  });
}

const okTransport: MailTransport = async () => {};
const failingTransport: MailTransport = async () => {
  throw new Error("SMTP down");
};

describe("mailblast delivery tracking (TKT-013)", () => {
  it("records deliveryError on a failed send (rows stay unsent)", async () => {
    const q = await makeQuestionnaire({ sampleEmails: ["a@example.com", "b@example.com"] });

    await sendInvitations(q.id, failingTransport);
    const rows = await db.invitation.findMany({ where: { questionnaireId: q.id } });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.sentAt === null)).toBe(true);
    expect(rows.every((r) => r.deliveryError !== null)).toBe(true);
    expect(rows.every((r) => r.deliveryError!.includes("SMTP down"))).toBe(true);
  });

  it("remindNonRespondents sets deliveryError on failure and clears it on success", async () => {
    const q = await makeQuestionnaire({ sampleEmails: ["a@example.com"] });
    await sendInvitations(q.id, okTransport); // sent, not yet clicked

    let result = await remindNonRespondents(q.id, failingTransport);
    expect(result.reminded).toBe(0);
    expect(result.failed).toBe(1);
    let row = await db.invitation.findFirstOrThrow({ where: { questionnaireId: q.id } });
    expect(row.deliveryError).toContain("SMTP down");

    result = await remindNonRespondents(q.id, okTransport);
    expect(result.reminded).toBe(1);
    expect(result.failed).toBe(0);
    row = await db.invitation.findFirstOrThrow({ where: { questionnaireId: q.id } });
    expect(row.sentAt).not.toBeNull();
    expect(row.deliveryError).toBeNull();
  });

  it("remindNonRespondents re-sends only to sent-but-not-clicked invitations", async () => {
    const q = await makeQuestionnaire({ sampleEmails: ["a@example.com", "b@example.com", "c@example.com"] });
    await sendInvitations(q.id, okTransport);
    const [a, b, c] = await db.invitation.findMany({
      where: { questionnaireId: q.id },
      orderBy: { email: "asc" },
    });

    // a: clicked; b: never sent (clear sentAt); c: still pending.
    await db.invitation.update({ where: { id: a.id }, data: { clickedAt: new Date() } });
    await db.invitation.update({ where: { id: b.id }, data: { sentAt: null } });

    const sent: string[] = [];
    const transport: MailTransport = async (msg) => {
      sent.push(msg.to);
    };
    const result = await remindNonRespondents(q.id, transport);

    expect(sent).toEqual(["c@example.com"]);
    expect(result.reminded).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("remindNonRespondents skips revoked invitations", async () => {
    const q = await makeQuestionnaire({ sampleEmails: ["a@example.com", "b@example.com"] });
    await sendInvitations(q.id, okTransport);
    const [a] = await db.invitation.findMany({
      where: { questionnaireId: q.id },
      orderBy: { email: "asc" },
    });
    await db.invitation.update({ where: { id: a.id }, data: { revokedAt: new Date() } });

    const sent: string[] = [];
    const transport: MailTransport = async (msg) => {
      sent.push(msg.to);
    };
    await remindNonRespondents(q.id, transport);
    expect(sent).not.toContain("a@example.com");
  });

  it("remindNonRespondents tracks failures per recipient", async () => {
    const q = await makeQuestionnaire({ sampleEmails: ["a@example.com"] });
    await sendInvitations(q.id, okTransport);

    const result = await remindNonRespondents(q.id, failingTransport);
    expect(result.reminded).toBe(0);
    expect(result.failed).toBe(1);

    const row = await db.invitation.findFirstOrThrow({ where: { questionnaireId: q.id } });
    expect(row.deliveryError).toContain("SMTP down");
  });

  it("reminder mail is labelled as a reminder", () => {
    const msg = buildInvitationMail({
      to: "a@example.com",
      link: "/f/slug?invite=tok",
      questionnaireTitle: "Sensus",
      isReminder: true,
    });
    expect(msg.subject).toContain("Reminder");
  });
});
