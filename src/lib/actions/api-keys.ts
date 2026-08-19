"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/http";
import { requirePermission } from "@/lib/auth/rbac";
import { toAppError } from "@/lib/errors";
import { assertWithinLimit, recordRateLimitEvent } from "@/services/rate-limit.service";
import {
  createApiKeyRequest,
  listApiKeyRequests,
  approveApiKeyRequest,
  denyApiKeyRequest,
  issueApiKey,
  revokeApiKey,
  listApiKeys,
  type ApiKeyRequestInput,
} from "@/services/api-key.service";

function actionError(err: unknown): { error: string } {
  const appErr = toAppError(err);
  return { error: appErr.message };
}

/** Portal abuse guard: 5 submissions / hour per IP (reuses rate-limit machinery). */
const PORTAL_REQUEST_WINDOW_MS = 60 * 60 * 1000;
const PORTAL_REQUEST_MAX = 5;

/** Public: submit a self-serve API key request (no login required). */
export async function submitApiKeyRequestAction(
  input: ApiKeyRequestInput,
  ip?: string | null
): Promise<{ error?: string; requestId?: string }> {
  try {
    const key = `portal:${ip ?? "unknown"}`;
    await assertWithinLimit(key, PORTAL_REQUEST_MAX, PORTAL_REQUEST_WINDOW_MS);
    const request = await createApiKeyRequest(input);
    await recordRateLimitEvent(key);
    return { requestId: request.id };
  } catch (err) {
    return actionError(err);
  }
}

/** Admin-only: approve a PENDING request; returns the secret exactly once. */
export async function approveApiKeyRequestAction(
  requestId: string
): Promise<{ error?: string; secret?: string; keyPrefix?: string }> {
  try {
    const session = await getSession();
    requirePermission(session, "MANAGE_API_KEYS");
    const { key, secret } = await approveApiKeyRequest(requestId, session.sub);
    revalidatePath("/admin/api-keys");
    return { secret, keyPrefix: key.keyPrefix };
  } catch (err) {
    return actionError(err);
  }
}

/** Admin-only: deny a PENDING request. */
export async function denyApiKeyRequestAction(
  requestId: string
): Promise<{ error?: string }> {
  try {
    const session = await getSession();
    requirePermission(session, "MANAGE_API_KEYS");
    await denyApiKeyRequest(requestId, session.sub);
    revalidatePath("/admin/api-keys");
    return {};
  } catch (err) {
    return actionError(err);
  }
}

/** Admin + dev: issue a key directly (bypassing the portal). */
export async function issueApiKeyAction(input: {
  name: string;
  scopes: string[];
  expiresAt?: string | null;
}): Promise<{ error?: string; secret?: string; keyPrefix?: string }> {
  try {
    const session = await getSession();
    requirePermission(session, "ISSUE_API_KEYS");
    const { key, secret } = await issueApiKey({
      name: input.name,
      scopes: input.scopes as never,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      createdBy: session.sub,
    });
    revalidatePath("/admin/api-keys");
    return { secret, keyPrefix: key.keyPrefix };
  } catch (err) {
    return actionError(err);
  }
}

/** Admin + dev: revoke a key (status flip). */
export async function revokeApiKeyAction(
  keyId: string
): Promise<{ error?: string }> {
  try {
    const session = await getSession();
    requirePermission(session, "ISSUE_API_KEYS");
    await revokeApiKey(keyId);
    revalidatePath("/admin/api-keys");
    return {};
  } catch (err) {
    return actionError(err);
  }
}

/** Read model for the admin panel: keys + portal requests + usage counts. */
export interface AdminApiKeyDashboard {
  keys: (Awaited<ReturnType<typeof listApiKeys>>[number] & { requestCount: number })[];
  requests: Awaited<ReturnType<typeof listApiKeyRequests>>;
  /** DEV can issue/revoke but cannot see the approval queue (admin-only). */
  canApproveRequests: boolean;
}

export async function getAdminApiKeyDashboard(): Promise<AdminApiKeyDashboard | null> {
  const session = await getSession();
  if (!session) return null;
  const rbac = await import("@/lib/auth/rbac");
  const canIssue = rbac.hasPermission(session, "ISSUE_API_KEYS");
  const canApprove = rbac.hasPermission(session, "MANAGE_API_KEYS");
  if (!canIssue && !canApprove) return null;

  const [keys, requests, usage] = await Promise.all([
    listApiKeys(),
    listApiKeyRequests(),
    db.apiRequestLog.groupBy({
      by: ["apiKeyId"],
      _count: { _all: true },
      where: { apiKeyId: { not: null } },
    }),
  ]);
  const usageMap = new Map(usage.map((u) => [u.apiKeyId, u._count._all]));
  return {
    keys: keys.map((k) => ({ ...k, requestCount: usageMap.get(k.id) ?? 0 })),
    requests: canApprove ? requests : [],
    canApproveRequests: canApprove,
  };
}
