import { describe, it, expect } from "vitest";
import { hasPermission, PERMISSIONS, type Permission } from "@/lib/auth/rbac";
import type { Role } from "@prisma/client";

const admin = { role: "ADMIN" as Role };
const operator = { role: "OPERATOR" as Role };

describe("rbac permissions", () => {
  it("admin has every permission", () => {
    for (const p of PERMISSIONS.ADMIN) {
      expect(hasPermission(admin, p)).toBe(true);
    }
  });

  it("operator can manage questionnaires and create question masters", () => {
    expect(hasPermission(operator, "MANAGE_QUESTIONNAIRES")).toBe(true);
    expect(hasPermission(operator, "CREATE_QUESTION_MASTER")).toBe(true);
  });

  it("operator cannot manage users or master data", () => {
    expect(hasPermission(operator, "MANAGE_USERS")).toBe(false);
    expect(hasPermission(operator, "MANAGE_MASTER_DATA")).toBe(false);
  });

  it("null user has no permissions", () => {
    expect(hasPermission(null, "MANAGE_QUESTIONNAIRES")).toBe(false);
  });

  it("an unknown permission is denied", () => {
    expect(hasPermission(admin, "NOPE" as Permission)).toBe(false);
  });
});
