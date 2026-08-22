import bcrypt from "bcryptjs";
import type { Role, User } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError, NotFoundError } from "@/lib/errors";

const PASSWORD_MIN_LENGTH = 8;

export interface CreateUserInput {
  email: string;
  name: string;
  password: string;
  role: Role;
  /** Optional explicit username (TKT-051); defaults to the email local part (deduped). */
  username?: string;
}

export interface UpdateUserInput {
  name?: string;
  role?: Role;
  email?: string;
}

export function validatePassword(password: string): void {
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    throw new AppError(
      `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
      422,
      "WEAK_PASSWORD"
    );
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// ------------------------------------------------- TKT-051: usernames

const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;

/** Normalize a sign-in handle: trimmed, lowercased. */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

/** Validate a user-supplied username; returns the normalized form or throws. */
export function validateUsername(username: string): string {
  const normalized = normalizeUsername(username);
  if (!USERNAME_RE.test(normalized)) {
    throw new AppError(
      "Username must be 3–30 characters (letters, numbers, dot, dash, underscore)",
      422,
      "INVALID_USERNAME"
    );
  }
  return normalized;
}

/** Throw USERNAME_TAKEN when the normalized username is already in use. */
async function assertUsernameFree(raw: string): Promise<string> {
  const username = validateUsername(raw);
  const taken = await db.user.findUnique({ where: { username } });
  if (taken) {
    throw new AppError("This username is already taken", 409, "USERNAME_TAKEN");
  }
  return username;
}

/**
 * Reserve a unique username starting from `base` (typically an email local
 * part): sanitized, truncated, then suffixed -2/-3… on collision.
 */
async function uniqueUsername(base: string): Promise<string> {
  const candidate =
    normalizeUsername(base).replace(/[^a-z0-9._-]/g, "").slice(0, 28) || "user";
  let current = candidate;
  let n = 2;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const taken = await db.user.findUnique({ where: { username: current } });
    if (!taken) return current;
    current = `${candidate}-${n}`;
    n += 1;
  }
}

/** Create a user with a bcrypt-hashed password. */
export async function createUser(input: CreateUserInput): Promise<User> {
  validatePassword(input.password);
  const email = normalizeEmail(input.email);
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError("A user with this email already exists", 409, "EMAIL_TAKEN");
  }
  const username = input.username
    ? await assertUsernameFree(input.username)
    : await uniqueUsername(email.split("@")[0]);
  const passwordHash = await bcrypt.hash(input.password, 10);
  return db.user.create({
    data: {
      email,
      username,
      name: input.name.trim(),
      passwordHash,
      role: input.role,
    },
  });
}

export interface RegisterUserInput {
  username: string;
  email: string;
  password: string;
}

/**
 * TKT-051: public self-registration. The account is created INACTIVE with the
 * OPERATOR role and cannot sign in until an admin activates it — `authenticate`
 * already rejects inactive users, so the gate comes for free.
 */
export async function registerPublicUser(input: RegisterUserInput): Promise<User> {
  validatePassword(input.password);
  const username = validateUsername(input.username);
  const email = normalizeEmail(input.email);
  const existing = await db.user.findFirst({
    where: { OR: [{ email }, { username }] },
  });
  if (existing) {
    const emailTaken = existing.email === email;
    throw new AppError(
      emailTaken
        ? "A user with this email already exists"
        : "This username is already taken",
      409,
      emailTaken ? "EMAIL_TAKEN" : "USERNAME_TAKEN"
    );
  }
  const passwordHash = await bcrypt.hash(input.password, 10);
  return db.user.create({
    data: {
      email,
      username,
      name: username,
      passwordHash,
      role: "OPERATOR",
      isActive: false,
    },
  });
}

export async function listUsers(): Promise<User[]> {
  return db.user.findMany({ orderBy: { email: "asc" } });
}

export async function getUserById(id: string): Promise<User | null> {
  return db.user.findUnique({ where: { id } });
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<User> {
  const existing = await db.user.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("User not found");

  let email: string | undefined;
  if (input.email !== undefined) {
    email = normalizeEmail(input.email);
    if (email !== existing.email) {
      const taken = await db.user.findUnique({ where: { email } });
      if (taken) {
        throw new AppError("A user with this email already exists", 409, "EMAIL_TAKEN");
      }
    }
  }

  return db.user.update({
    where: { id },
    data: {
      ...(email !== undefined ? { email } : {}),
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
    },
  });
}

export async function setUserActive(
  id: string,
  isActive: boolean,
  opts: { actorId?: string } = {}
): Promise<User> {
  const existing = await db.user.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("User not found");

  // TKT-029 guards: never lock out the system.
  if (!isActive) {
    if (opts.actorId && opts.actorId === id) {
      throw new AppError("You cannot disable your own account", 409, "SELF_DISABLE");
    }
    if (existing.role === "ADMIN") {
      const otherActiveAdmins = await db.user.count({
        where: { role: "ADMIN", isActive: true, id: { not: id } },
      });
      if (otherActiveAdmins === 0) {
        throw new AppError(
          "Cannot disable the last active admin — the system needs at least one admin",
          409,
          "LAST_ACTIVE_ADMIN"
        );
      }
    }
  }

  return db.user.update({ where: { id }, data: { isActive } });
}

/** TKT-029: whether a user is currently active (false for missing users too). */
export async function isUserActive(id: string): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id }, select: { isActive: true } });
  return user?.isActive ?? false;
}

export async function resetPassword(id: string, newPassword: string): Promise<void> {
  validatePassword(newPassword);
  const existing = await db.user.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("User not found");
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.user.update({ where: { id }, data: { passwordHash } });
}

/**
 * Verify credentials. Accepts the username OR the email as `identifier`.
 * Returns the user on success, null on failure or when inactive (TKT-051:
 * pending registrations can't sign in until an admin activates them).
 */
export async function authenticate(
  identifier: string,
  password: string
): Promise<User | null> {
  const key = identifier.trim().toLowerCase();
  const user = await db.user.findFirst({
    where: { OR: [{ email: key }, { username: key }] },
  });
  if (!user || !user.isActive) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  return ok ? user : null;
}
