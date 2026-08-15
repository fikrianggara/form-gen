import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { truncateAll } from "./helpers";
import { createUser } from "@/services/user.service";
import { createQuestionnaire } from "@/services/questionnaire.service";
import { assertCanManageQuestionnaire } from "@/services/access-control.service";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import type { Role } from "@prisma/client";

beforeEach(async () => {
  await truncateAll();
});

function principal(id: string, role: Role) {
  return { sub: id, email: "x@example.com", name: "X", role };
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
