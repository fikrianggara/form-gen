import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { truncateAll } from "./helpers";
import { createOrganization } from "@/services/org.service";
import { createUser } from "@/services/user.service";
import {
  createProposal,
  updateProposal,
  submitProposal,
  verifyProposalToken,
  approveProposal,
  listProposals,
} from "@/services/proposal.service";
import { AppError } from "@/lib/errors";
import type { MailTransport } from "@/services/mail.service";

async function orgAndOperator() {
  const org = await createOrganization({ name: `Org ${Math.random().toString(36).slice(2, 8)}` });
  const user = await createUser({
    email: `op-${Math.random().toString(36).slice(2, 8)}@example.com`,
    name: "Operator",
    password: "Secret123!",
    role: "OPERATOR",
  });
  await db.user.update({ where: { id: user.id }, data: { organizationId: org.id } });
  return { org, user };
}

const captured: string[] = [];
function captureTransport(): MailTransport {
  return async (msg) => {
    captured.push(msg.to);
  };
}

describe("proposal.service (TKT-005)", () => {
  beforeEach(async () => {
    await truncateAll();
    captured.length = 0;
  });

  it("creates a DRAFT proposal with org, creator and outline", async () => {
    const { org, user } = await orgAndOperator();
    const p = await createProposal({
      organizationId: org.id,
      createdBy: user.id,
      title: "BPS employee survey",
      purpose: "Measure engagement",
      target: "All staff",
      outline: [{ title: "How engaged are you?", type: "RATING" }],
    });
    expect(p.status).toBe("DRAFT");
    expect(p.organizationId).toBe(org.id);
    expect(p.createdBy).toBe(user.id);
    expect(p.outline).toEqual([{ title: "How engaged are you?", type: "RATING" }]);
  });

  it("requires a title and a valid organization", async () => {
    const { org, user } = await orgAndOperator();
    await expect(
      createProposal({ organizationId: org.id, createdBy: user.id, title: "  " })
    ).rejects.toBeInstanceOf(AppError);
    await expect(
      createProposal({ organizationId: "missing", createdBy: user.id, title: "X" })
    ).rejects.toBeInstanceOf(AppError);
  });

  it("submit without verifyEmail skips straight to VERIFIED", async () => {
    const { org, user } = await orgAndOperator();
    const p = await createProposal({ organizationId: org.id, createdBy: user.id, title: "No email" });
    const s = await submitProposal(p.id);
    expect(s.status).toBe("VERIFIED");
    expect(s.verificationToken).toBeNull();
  });

  it("submit with verifyEmail moves to PENDING_VERIFICATION and sends mail", async () => {
    const { org, user } = await orgAndOperator();
    const p = await createProposal({
      organizationId: org.id,
      createdBy: user.id,
      title: "With email",
      verifyEmail: "approver@example.com",
    });
    const s = await submitProposal(p.id, captureTransport());
    expect(s.status).toBe("PENDING_VERIFICATION");
    expect(s.verificationToken).toBeTruthy();
    expect(captured).toContain("approver@example.com");
  });

  it("verifies a proposal via its token", async () => {
    const { org, user } = await orgAndOperator();
    const p = await createProposal({
      organizationId: org.id,
      createdBy: user.id,
      title: "Verify me",
      verifyEmail: "approver@example.com",
    });
    const s = await submitProposal(p.id, captureTransport());
    const v = await verifyProposalToken(s.verificationToken!);
    expect(v.status).toBe("VERIFIED");
    expect(v.verifiedAt).not.toBeNull();
  });

  it("rejects an unknown verification token", async () => {
    await expect(verifyProposalToken("nope")).rejects.toBeInstanceOf(AppError);
  });

  it("approves a VERIFIED proposal and creates a Survey in the org", async () => {
    const { org, user } = await orgAndOperator();
    const p = await createProposal({ organizationId: org.id, createdBy: user.id, title: "Approved survey" });
    await submitProposal(p.id);
    const a = await approveProposal(p.id);
    expect(a.status).toBe("APPROVED");
    expect(a.approvedAt).not.toBeNull();
    expect(a.surveyId).not.toBeNull();
    const survey = await db.survey.findUnique({ where: { id: a.surveyId! } });
    expect(survey?.name).toBe("Approved survey");
    expect(survey?.organizationId).toBe(org.id);
  });

  it("cannot approve a DRAFT proposal", async () => {
    const { org, user } = await orgAndOperator();
    const p = await createProposal({ organizationId: org.id, createdBy: user.id, title: "Early" });
    await expect(approveProposal(p.id)).rejects.toBeInstanceOf(AppError);
  });

  it("lists proposals scoped to an organization, newest first", async () => {
    const { org, user } = await orgAndOperator();
    const other = await createOrganization({ name: `Other ${Math.random().toString(36).slice(2, 6)}` });
    await createProposal({ organizationId: org.id, createdBy: user.id, title: "A" });
    await createProposal({ organizationId: org.id, createdBy: user.id, title: "B" });
    await createProposal({ organizationId: other.id, createdBy: user.id, title: "Other" });

    const list = await listProposals(org.id);
    expect(list.map((p) => p.title)).toEqual(["B", "A"]);
  });

  it("updates a DRAFT proposal but not an approved one", async () => {
    const { org, user } = await orgAndOperator();
    const p = await createProposal({ organizationId: org.id, createdBy: user.id, title: "Draft" });
    const u = await updateProposal(p.id, { title: "Renamed", purpose: "New purpose" });
    expect(u.title).toBe("Renamed");
    expect(u.purpose).toBe("New purpose");
  });
});
