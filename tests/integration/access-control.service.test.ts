import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { truncateAll } from "./helpers";
import { createUser } from "@/services/user.service";
import { createQuestionnaire } from "@/services/questionnaire.service";
import { assertCanManageQuestionnaire, assertCanDeleteQuestionnaire } from "@/services/access-control.service";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import type { Role } from "@prisma/client";

beforeEach(async () => {
  await truncateAll();
});

function principal(id: string, role: Role, organizationId: string | null = null) {
  return { sub: id, email: "x@example.com", name: "X", role, organizationId };
}

describe("questionnaire access control (TKT-017)", () => {
  it("allows ADMIN to manage any questionnaire", async () => {
    const owner = await createUser({ email: "owner@example.com", name: "Owner", password: "Secret123!", role: "OPERATOR" });
    const other = await createUser({ email: "admin@example.com", name: "Admin", password: "Secret123!", role: "ADMIN" });
    const q = await createQuestionnaire({ title: "Q", slug: "q-admin-any", createdBy: owner.id });

    await expect(assertCanManageQuestionnaire(principal(other.id, "ADMIN"), q.id)).resolves.not.toThrow();
  });

  it("allows the OPERATOR who created the questionnaire", async () => {
    const owner = await createUser({ email: "owner2@example.com", name: "Owner", password: "Secret123!", role: "OPERATOR" });
    const q = await createQuestionnaire({ title: "Q", slug: "q-owner", createdBy: owner.id });

    await expect(assertCanManageQuestionnaire(principal(owner.id, "OPERATOR"), q.id)).resolves.not.toThrow();
  });

  it("allows OPERATOR for legacy unowned questionnaires", async () => {
    const op = await createUser({ email: "op@example.com", name: "Op", password: "Secret123!", role: "OPERATOR" });
    const q = await createQuestionnaire({ title: "Q", slug: "q-legacy" });

    await expect(assertCanManageQuestionnaire(principal(op.id, "OPERATOR"), q.id)).resolves.not.toThrow();
  });

  it("forbids an OPERATOR from managing another creator's questionnaire", async () => {
    const owner = await createUser({ email: "owner3@example.com", name: "Owner", password: "Secret123!", role: "OPERATOR" });
    const intruder = await createUser({ email: "intruder@example.com", name: "Intruder", password: "Secret123!", role: "OPERATOR" });
    const q = await createQuestionnaire({ title: "Q", slug: "q-intruder", createdBy: owner.id });

    await expect(assertCanManageQuestionnaire(principal(intruder.id, "OPERATOR"), q.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects anonymous principals", async () => {
    const q = await createQuestionnaire({ title: "Q", slug: "q-anon" });
    await expect(assertCanManageQuestionnaire(null, q.id)).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe("questionnaire delete access control (TKT-040)", () => {
  it("allows ADMIN to delete any questionnaire", async () => {
    const owner = await createUser({ email: "del-owner@example.com", name: "Owner", password: "Secret123!", role: "OPERATOR" });
    const admin = await createUser({ email: "del-admin@example.com", name: "Admin", password: "Secret123!", role: "ADMIN" });
    const q = await createQuestionnaire({ title: "Q", slug: "del-q-admin", createdBy: owner.id });

    await expect(assertCanDeleteQuestionnaire(principal(admin.id, "ADMIN"), q.id)).resolves.not.toThrow();
  });

  it("allows the OPERATOR who created the questionnaire to delete it", async () => {
    const owner = await createUser({ email: "del-owner2@example.com", name: "Owner", password: "Secret123!", role: "OPERATOR" });
    const q = await createQuestionnaire({ title: "Q", slug: "del-q-owner", createdBy: owner.id });

    await expect(assertCanDeleteQuestionnaire(principal(owner.id, "OPERATOR"), q.id)).resolves.not.toThrow();
  });

  it("forbids an OPERATOR from deleting another creator's questionnaire", async () => {
    const owner = await createUser({ email: "del-owner3@example.com", name: "Owner", password: "Secret123!", role: "OPERATOR" });
    const intruder = await createUser({ email: "del-intruder@example.com", name: "Intruder", password: "Secret123!", role: "OPERATOR" });
    const q = await createQuestionnaire({ title: "Q", slug: "del-q-intruder", createdBy: owner.id });

    await expect(assertCanDeleteQuestionnaire(principal(intruder.id, "OPERATOR"), q.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("forbids an OPERATOR from deleting a legacy unowned questionnaire (stricter than manage)", async () => {
    const op = await createUser({ email: "del-op@example.com", name: "Op", password: "Secret123!", role: "OPERATOR" });
    const q = await createQuestionnaire({ title: "Q", slug: "del-q-legacy" });
    // Manage allows legacy; DELETE does not — admin only.
    await expect(assertCanManageQuestionnaire(principal(op.id, "OPERATOR"), q.id)).resolves.not.toThrow();
    await expect(assertCanDeleteQuestionnaire(principal(op.id, "OPERATOR"), q.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects anonymous principals for delete", async () => {
    const q = await createQuestionnaire({ title: "Q", slug: "del-q-anon" });
    await expect(assertCanDeleteQuestionnaire(null, q.id)).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
