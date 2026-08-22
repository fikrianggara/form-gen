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
  isUserActive,
  registerPublicUser,
  validateUsername,
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

  // ---------------------------------------------------------- TKT-029

  it("isUserActive is true for an active user", async () => {
    const user = await createUser({ email: "on@example.com", name: "On", password: "Secret123!", role: "OPERATOR" });
    expect(await isUserActive(user.id)).toBe(true);
  });

  it("isUserActive is false for a disabled user", async () => {
    const user = await createUser({ email: "dis@example.com", name: "Dis", password: "Secret123!", role: "OPERATOR" });
    await setUserActive(user.id, false);
    expect(await isUserActive(user.id)).toBe(false);
  });

  it("isUserActive is false for a missing user", async () => {
    expect(await isUserActive("does-not-exist")).toBe(false);
  });

  it("setUserActive refuses to disable the last active ADMIN", async () => {
    const admin = await createUser({ email: "only-admin@example.com", name: "Sole", password: "Secret123!", role: "ADMIN" });
    await expect(setUserActive(admin.id, false)).rejects.toMatchObject({
      statusCode: 409,
      code: "LAST_ACTIVE_ADMIN",
    });
    // Still active after the refusal.
    expect(await isUserActive(admin.id)).toBe(true);
  });

  it("setUserActive allows disabling an ADMIN when another active ADMIN exists", async () => {
    await createUser({ email: "admin1@example.com", name: "A1", password: "Secret123!", role: "ADMIN" });
    const admin2 = await createUser({ email: "admin2@example.com", name: "A2", password: "Secret123!", role: "ADMIN" });
    await setUserActive(admin2.id, false);
    expect(await isUserActive(admin2.id)).toBe(false);
  });

  it("setUserActive allows disabling an OPERATOR (not an admin guard case)", async () => {
    const op = await createUser({ email: "op@example.com", name: "Op", password: "Secret123!", role: "OPERATOR" });
    await setUserActive(op.id, false);
    expect(await isUserActive(op.id)).toBe(false);
  });

  it("setUserActive refuses to disable your own account (actorId === id)", async () => {
    const admin = await createUser({ email: "self@example.com", name: "Self", password: "Secret123!", role: "ADMIN" });
    await createUser({ email: "other-admin@example.com", name: "Other", password: "Secret123!", role: "ADMIN" });
    await expect(setUserActive(admin.id, false, { actorId: admin.id })).rejects.toMatchObject({
      statusCode: 409,
      code: "SELF_DISABLE",
    });
    expect(await isUserActive(admin.id)).toBe(true);
  });

  it("setUserActive allows another admin to disable a user", async () => {
    const admin = await createUser({ email: "target@example.com", name: "Target", password: "Secret123!", role: "ADMIN" });
    await createUser({ email: "actor@example.com", name: "Actor", password: "Secret123!", role: "ADMIN" });
    await setUserActive(admin.id, false, { actorId: (await db.user.findUnique({ where: { email: "actor@example.com" } }))!.id });
    expect(await isUserActive(admin.id)).toBe(false);
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

describe("TKT-051: usernames + public registration", () => {
  it("registerPublicUser creates an INACTIVE OPERATOR user with the normalized username", async () => {
    const user = await registerPublicUser({
      username: "Budi.Santoso",
      email: "BUDI@Example.com",
      password: "Secret123!",
    });
    expect(user.username).toBe("budi.santoso");
    expect(user.email).toBe("budi@example.com");
    expect(user.role).toBe("OPERATOR");
    expect(user.isActive).toBe(false);
    expect(await isUserActive(user.id)).toBe(false);
  });

  it("rejects a duplicate email with EMAIL_TAKEN", async () => {
    await registerPublicUser({ username: "one", email: "dup@example.com", password: "Secret123!" });
    await expect(
      registerPublicUser({ username: "two", email: "dup@example.com", password: "Secret123!" })
    ).rejects.toMatchObject({ statusCode: 409, code: "EMAIL_TAKEN" });
  });

  it("rejects a duplicate username with USERNAME_TAKEN (case-insensitive)", async () => {
    await registerPublicUser({ username: "same", email: "a@example.com", password: "Secret123!" });
    await expect(
      registerPublicUser({ username: "SAME", email: "b@example.com", password: "Secret123!" })
    ).rejects.toMatchObject({ statusCode: 409, code: "USERNAME_TAKEN" });
  });

  it("rejects invalid usernames and weak passwords", async () => {
    expect(() => validateUsername("ab")).toThrow(/Username must be/);
    expect(() => validateUsername("has space")).toThrow(/Username must be/);
    expect(() => validateUsername("bad@char")).toThrow(/Username must be/);
    await expect(
      registerPublicUser({ username: "valid", email: "x@example.com", password: "short" })
    ).rejects.toMatchObject({ code: "WEAK_PASSWORD" });
  });

  it("an inactive registration CANNOT sign in (same response as wrong password)", async () => {
    const user = await registerPublicUser({
      username: "pending",
      email: "pending@example.com",
      password: "Secret123!",
    });
    expect(await authenticate("pending@example.com", "Secret123!")).toBeNull();
    expect(await authenticate("pending", "Secret123!")).toBeNull();
    expect(await authenticate("pending", "wrong-password!")).toBeNull();
    expect(user.isActive).toBe(false);
  });

  it("after admin activation, the user signs in by username AND by email", async () => {
    const user = await registerPublicUser({
      username: "activateme",
      email: "activate@example.com",
      password: "Secret123!",
    });
    await setUserActive(user.id, true);
    const byEmail = await authenticate("activate@example.com", "Secret123!");
    const byUsername = await authenticate("ACTIVATEME", "Secret123!");
    expect(byEmail?.id).toBe(user.id);
    expect(byUsername?.id).toBe(user.id);
  });

  it("createUser derives a unique username from the email local part", async () => {
    const first = await createUser({ email: "alice@example.com", name: "Alice", password: "Secret123!", role: "OPERATOR" });
    // Same local part, different domain → deduped to alice-2.
    const second = await createUser({ email: "alice@other.com", name: "Alice 2", password: "Secret123!", role: "OPERATOR" });
    expect(first.username).toBe("alice");
    expect(second.username).toBe("alice-2");
  });

  it("createUser honors an explicit username and rejects collisions", async () => {
    await createUser({ email: "explicit@example.com", name: "E", password: "Secret123!", role: "OPERATOR", username: "custom" });
    await expect(
      createUser({ email: "explicit2@example.com", name: "E2", password: "Secret123!", role: "OPERATOR", username: "custom" })
    ).rejects.toMatchObject({ code: "USERNAME_TAKEN" });
  });
});
