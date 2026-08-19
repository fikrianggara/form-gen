import { describe, it, expect } from "vitest";
import { hasPermission, PERMISSIONS, type Permission } from "@/lib/auth/rbac";
import type { Role } from "@prisma/client";

const admin = { role: "ADMIN" as Role };
const operator = { role: "OPERATOR" as Role };
const dev = { role: "DEV" as Role };

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

  it("operator cannot manage users, master data, or issue API keys", () => {
    expect(hasPermission(operator, "MANAGE_USERS")).toBe(false);
    expect(hasPermission(operator, "MANAGE_MASTER_DATA")).toBe(false);
    expect(hasPermission(operator, "ISSUE_API_KEYS")).toBe(false);
    expect(hasPermission(operator, "MANAGE_API_KEYS")).toBe(false);
  });

  it("dev has operator abilities plus key issuance, but not portal approval", () => {
    expect(hasPermission(dev, "MANAGE_QUESTIONNAIRES")).toBe(true);
    expect(hasPermission(dev, "CREATE_QUESTION_MASTER")).toBe(true);
    expect(hasPermission(dev, "ISSUE_API_KEYS")).toBe(true);
    // Trust boundary: only ADMIN approves portal requests
    expect(hasPermission(dev, "MANAGE_API_KEYS")).toBe(false);
    expect(hasPermission(dev, "MANAGE_USERS")).toBe(false);
    expect(hasPermission(dev, "MANAGE_MASTER_DATA")).toBe(false);
  });

  it("null user has no permissions", () => {
    expect(hasPermission(null, "MANAGE_QUESTIONNAIRES")).toBe(false);
  });

  it("an unknown permission is denied", () => {
    expect(hasPermission(admin, "NOPE" as Permission)).toBe(false);
  });
});
