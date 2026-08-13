import type { Role } from "@prisma/client";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";

export type Permission =
  | "MANAGE_USERS" // admin only
  | "MANAGE_MASTER_DATA" // admin only: option sets + edit/delete question masters
  | "CREATE_QUESTION_MASTER" // admin + operator (create only)
  | "MANAGE_QUESTIONNAIRES"; // admin + operator

export const PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: [
    "MANAGE_USERS",
    "MANAGE_MASTER_DATA",
    "CREATE_QUESTION_MASTER",
    "MANAGE_QUESTIONNAIRES",
  ],
  OPERATOR: ["CREATE_QUESTION_MASTER", "MANAGE_QUESTIONNAIRES"],
};

export interface Principal {
  role: Role;
}

/** Role-based capability check. `null` principal (anonymous) has no permissions. */
export function hasPermission(
  principal: Principal | null,
  permission: Permission
): boolean {
  if (!principal) return false;
  return PERMISSIONS[principal.role]?.includes(permission) ?? false;
}

/** Throw UnauthorizedError when not authenticated. */
export function requireAuth(principal: Principal | null): asserts principal is Principal {
  if (!principal) {
    throw new UnauthorizedError();
  }
}

/** Throw ForbiddenError when the principal lacks a permission. */
export function requirePermission(
  principal: Principal | null,
  permission: Permission
): asserts principal is Principal {
  requireAuth(principal);
  if (!hasPermission(principal, permission)) {
    throw new ForbiddenError();
  }
}
