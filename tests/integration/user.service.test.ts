import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { truncateAll } from "./helpers";
import {
  createUser,
  updateUser,
  setUserActive,
  resetPassword,
  authenticate,
  listUsers,
  getUserById,
} from "@/services/user.service";
import { AppError } from "@/lib/errors";
import bcrypt from "bcryptjs";

beforeEach(async () => {
  await truncateAll();
});

describe("user service", () => {
  it("creates a user with a hashed password", async () => {
    const user = await createUser({
      email: "a@example.com",
      name: "Alice",
      password: "Secret123!",
      role: "OPERATOR",
    });
    expect(user.id).toBeTruthy();
    expect(user.email).toBe("a@example.com");
    expect(user.role).toBe("OPERATOR");
    expect(user.isActive).toBe(true);
    const stored = await db.user.findUnique({ where: { id: user.id } });
    expect(stored?.passwordHash).not.toBe("Secret123!");
    expect(bcrypt.compareSync("Secret123!", stored?.passwordHash ?? "")).toBe(true);
  });

  it("rejects duplicate emails", async () => {
    await createUser({
      email: "dup@example.com",
      name: "One",
      password: "Secret123!",
      role: "ADMIN",
    });
    await expect(
      createUser({
        email: "dup@example.com",
        name: "Two",
        password: "Secret123!",
        role: "OPERATOR",
      })
    ).rejects.toThrow(/unique|already|exist/i);
  });

  it("rejects a weak password", async () => {
    await expect(
      createUser({
        email: "weak@example.com",
        name: "Weak",
        password: "short",
        role: "OPERATOR",
      })
    ).rejects.toThrow(/password/i);
  });

  it("lists users ordered by email", async () => {
    await createUser({ email: "b@example.com", name: "B", password: "Secret123!", role: "OPERATOR" });
    await createUser({ email: "a@example.com", name: "A", password: "Secret123!", role: "ADMIN" });
    const users = await listUsers();
    expect(users.map((u) => u.email)).toEqual(["a@example.com", "b@example.com"]);
  });

  it("updates name and role", async () => {
    const user = await createUser({ email: "u@example.com", name: "Old", password: "Secret123!", role: "OPERATOR" });
    const updated = await updateUser(user.id, { name: "New", role: "ADMIN" });
    expect(updated.name).toBe("New");
    expect(updated.role).toBe("ADMIN");
  });

  it("updates email with normalization", async () => {
    const user = await createUser({ email: "old@example.com", name: "E", password: "Secret123!", role: "OPERATOR" });
    const updated = await updateUser(user.id, { email: "  NEW@Example.COM " });
    expect(updated.email).toBe("new@example.com");
    // Old address no longer resolves; new one authenticates.
    expect(await authenticate("old@example.com", "Secret123!")).toBeNull();
    expect((await authenticate("new@example.com", "Secret123!"))?.id).toBe(user.id);
  });

  it("keeps the same email when re-saving unchanged", async () => {
    const user = await createUser({ email: "same@example.com", name: "S", password: "Secret123!", role: "OPERATOR" });
    const updated = await updateUser(user.id, { email: "same@example.com", name: "Renamed" });
    expect(updated.email).toBe("same@example.com");
    expect(updated.name).toBe("Renamed");
  });

  it("rejects updating to another user's email", async () => {
    const a = await createUser({ email: "a@example.com", name: "A", password: "Secret123!", role: "OPERATOR" });
    await createUser({ email: "b@example.com", name: "B", password: "Secret123!", role: "OPERATOR" });
    await expect(updateUser(a.id, { email: "b@example.com" })).rejects.toThrow(/already exists/i);
  });

  it("deactivates a user", async () => {
    const user = await createUser({ email: "d@example.com", name: "D", password: "Secret123!", role: "OPERATOR" });
    const deactivated = await setUserActive(user.id, false);
    expect(deactivated.isActive).toBe(false);
  });

  it("resets a password", async () => {
    const user = await createUser({ email: "r@example.com", name: "R", password: "Secret123!", role: "OPERATOR" });
    await resetPassword(user.id, "NewSecret456!");
    const authed = await authenticate("r@example.com", "NewSecret456!");
    expect(authed?.id).toBe(user.id);
    expect(await authenticate("r@example.com", "Secret123!")).toBeNull();
  });

  it("authenticates with correct credentials only", async () => {
    const user = await createUser({ email: "auth@example.com", name: "A", password: "Secret123!", role: "ADMIN" });
    expect((await authenticate("auth@example.com", "Secret123!"))?.id).toBe(user.id);
    expect(await authenticate("auth@example.com", "wrong")).toBeNull();
    expect(await authenticate("nope@example.com", "Secret123!")).toBeNull();
  });

  it("rejects login for a deactivated user", async () => {
    await createUser({ email: "off@example.com", name: "Off", password: "Secret123!", role: "OPERATOR" });
    const user = await db.user.findUnique({ where: { email: "off@example.com" } });
    await setUserActive(user!.id, false);
    expect(await authenticate("off@example.com", "Secret123!")).toBeNull();
  });

  it("throws AppError when updating a missing user", async () => {
    await expect(updateUser("missing-id", { name: "X" })).rejects.toBeInstanceOf(AppError);
  });

  it("gets a user by id", async () => {
    const created = await createUser({ email: "get@example.com", name: "G", password: "Secret123!", role: "OPERATOR" });
    const found = await getUserById(created.id);
    expect(found?.email).toBe("get@example.com");
  });
});
