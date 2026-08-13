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

/** Create a user with a bcrypt-hashed password. */
export async function createUser(input: CreateUserInput): Promise<User> {
  validatePassword(input.password);
  const email = normalizeEmail(input.email);
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError("A user with this email already exists", 409, "EMAIL_TAKEN");
  }
  const passwordHash = await bcrypt.hash(input.password, 10);
  return db.user.create({
    data: {
      email,
      name: input.name.trim(),
      passwordHash,
      role: input.role,
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

export async function setUserActive(id: string, isActive: boolean): Promise<User> {
  const existing = await db.user.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("User not found");
  return db.user.update({ where: { id }, data: { isActive } });
}

export async function resetPassword(id: string, newPassword: string): Promise<void> {
  validatePassword(newPassword);
  const existing = await db.user.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("User not found");
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.user.update({ where: { id }, data: { passwordHash } });
}

/** Verify credentials. Returns the user on success, null on failure/inactive. */
export async function authenticate(
  email: string,
  password: string
): Promise<User | null> {
  const user = await db.user.findUnique({ where: { email: normalizeEmail(email) } });
  if (!user || !user.isActive) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  return ok ? user : null;
}
