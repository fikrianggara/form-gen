import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { truncateAll } from "./helpers";
import {
  listSamplingFrame,
  replaceSamplingFrame,
  deleteSamplingFrameEntry,
  samplingFrameEmails,
} from "@/services/sampling-frame.service";
import { sendInvitations } from "@/services/invitation.service";
import type { MailTransport } from "@/services/mail.service";
import { NotFoundError } from "@/lib/errors";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await db.$disconnect();
});

async function makeQuestionnaire(overrides: { sampleEmails?: string[] } = {}) {
  return db.questionnaire.create({
    data: {
      title: "Frame Survey",
      slug: `frame-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      status: "ACTIVE",
      sampleEmails: (overrides.sampleEmails ?? []) as unknown as object,
    },
  });
}

const rows = [
  { organizationName: "BPS Pusat", contact: "ops@bps.go.id", contactType: "EMAIL" as const },
  { organizationName: "BPS Jakarta", contact: "+62 21 1234 5678", contactType: "PHONE" as const },
  { organizationName: "BPS Bandung", contact: "bandung@bps.go.id", contactType: "EMAIL" as const },
];

describe("sampling frame service (TKT-012)", () => {
  it("replaces the frame for a questionnaire and lists rows in row order", async () => {
    const q = await makeQuestionnaire();
    await replaceSamplingFrame(q.id, rows);

    const entries = await listSamplingFrame(q.id);
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.organizationName)).toEqual([
      "BPS Pusat",
      "BPS Jakarta",
      "BPS Bandung",
    ]);
    expect(entries.map((e) => e.rowIndex)).toEqual([0, 1, 2]);
  });

  it("replacing again discards the previous frame", async () => {
    const q = await makeQuestionnaire();
    await replaceSamplingFrame(q.id, rows);
    await replaceSamplingFrame(q.id, [rows[0]]);

    const entries = await listSamplingFrame(q.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].organizationName).toBe("BPS Pusat");
  });

  it("deletes a single entry", async () => {
    const q = await makeQuestionnaire();
    await replaceSamplingFrame(q.id, rows);
    const entries = await listSamplingFrame(q.id);

    await deleteSamplingFrameEntry(entries[1].id);
    const after = await listSamplingFrame(q.id);
    expect(after.map((e) => e.organizationName)).toEqual(["BPS Pusat", "BPS Bandung"]);
  });

  it("throws NotFound for an unknown questionnaire", async () => {
    await expect(replaceSamplingFrame("missing-id", rows)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("samplingFrameEmails returns only EMAIL contacts", async () => {
    const q = await makeQuestionnaire();
    await replaceSamplingFrame(q.id, rows);
    const emails = await samplingFrameEmails(q.id);
    expect(emails.sort()).toEqual(["bandung@bps.go.id", "ops@bps.go.id"]);
  });

  it("sendInvitations includes sampling-frame email contacts", async () => {
    const q = await makeQuestionnaire({ sampleEmails: ["legacy@example.com"] });
    await replaceSamplingFrame(q.id, rows);

    const sent: string[] = [];
    const transport: MailTransport = async (msg) => {
      sent.push(msg.to);
    };
    const invitations = await sendInvitations(q.id, transport);

    const sentTo = sent.sort();
    expect(sentTo).toEqual(["bandung@bps.go.id", "legacy@example.com", "ops@bps.go.id"]);
    expect(invitations).toHaveLength(3);
    // Phone-only contacts are NOT invited by email.
    expect(invitations.some((i) => i.email.includes("1234"))).toBe(false);
  });
});
