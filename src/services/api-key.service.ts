import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { AppError, UnauthorizedError, toAppError } from "@/lib/errors";
import { jsonOk, jsonError } from "@/lib/http";
import { assertWithinLimit, recordRateLimitEvent } from "@/services/rate-limit.service";
import {
  generateApiKeySecret,
  hashApiKey,
  keyPrefixFromSecret,
  isApiScope,
  type ApiScope,
} from "@/lib/api-key";

/** Default per-key rate limit: 60 requests / minute (analysis v03 §3.3). */
export const API_KEY_RATE_LIMIT = 60;
export const API_KEY_RATE_WINDOW_MS = 60 * 1000;

const UNAUTHORIZED = new UnauthorizedError("Missing or invalid API key");
const SCOPE_FORBIDDEN = new AppError(
  "This API key does not have permission for the requested scope",
  403,
  "SCOPE_FORBIDDEN"
);
const KEY_REVOKED = new AppError("This API key has been revoked", 401, "UNAUTHORIZED");
const KEY_EXPIRED = new AppError("This API key has expired", 401, "UNAUTHORIZED");

type ApiKeyRecord = Awaited<ReturnType<typeof db.apiKey.findUnique>>;

/** Parse the Bearer token out of the Authorization header (or null). */
function bearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

/**
 * Resolve and validate the API key from a request. Returns the stored record
 * (never the secret). Throws 401 for missing/invalid/revoked/expired keys.
 */
export async function requireApiKey(request: NextRequest): Promise<NonNullable<ApiKeyRecord>> {
  const token = bearerToken(request);
  if (!token) return Promise.reject(UNAUTHORIZED);

  const key = await db.apiKey.findUnique({ where: { keyHash: hashApiKey(token) } });
  if (!key) return Promise.reject(UNAUTHORIZED);

  if (key.status === "REVOKED") return Promise.reject(KEY_REVOKED);
  if (key.expiresAt && key.expiresAt.getTime() < Date.now()) {
    return Promise.reject(KEY_EXPIRED);
  }

  // Touch lastUsedAt (best-effort; never fail a request on a write error).
  await db.apiKey.update({
    where: { id: key.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => undefined);

  // Re-read so the caller sees the updated lastUsedAt.
  const refreshed = await db.apiKey.findUnique({ where: { id: key.id } });
  return refreshed ?? key;
}

/** Enforce a single capability scope on a resolved key (403 when missing). */
export function requireScope(
  key: NonNullable<ApiKeyRecord>,
  scope: ApiScope
): void {
  const scopes = Array.isArray(key.scopes) ? key.scopes : [];
  if (!scopes.includes(scope)) throw SCOPE_FORBIDDEN;
}

/** Issue a new API key. Returns the secret ONCE; only the hash is stored. */
export async function issueApiKey(input: {
  name: string;
  scopes: ApiScope[];
  expiresAt?: Date | null;
  createdBy?: string | null;
}) {
  const scopes = input.scopes.filter(isApiScope);
  if (scopes.length === 0) {
    throw new AppError("At least one valid scope is required", 422, "VALIDATION_ERROR");
  }
  const secret = generateApiKeySecret();
  const key = await db.apiKey.create({
    data: {
      name: input.name.trim(),
      keyHash: hashApiKey(secret),
      keyPrefix: keyPrefixFromSecret(secret),
      scopes,
      expiresAt: input.expiresAt ?? null,
      createdBy: input.createdBy ?? null,
    },
  });
  return { key, secret };
}

/** Rotate a key: new secret, same record; old secret stops working. */
export async function rotateApiKey(id: string) {
  const existing = await db.apiKey.findUnique({ where: { id } });
  if (!existing) throw new AppError("API key not found", 404, "NOT_FOUND");
  const secret = generateApiKeySecret();
  const key = await db.apiKey.update({
    where: { id },
    data: {
      keyHash: hashApiKey(secret),
      keyPrefix: keyPrefixFromSecret(secret),
      lastUsedAt: null,
    },
  });
  return { key, secret };
}

/** Revoke a key: status flip to REVOKED; the secret stops working. */
export async function revokeApiKey(id: string) {
  const existing = await db.apiKey.findUnique({ where: { id } });
  if (!existing) throw new AppError("API key not found", 404, "NOT_FOUND");
  return db.apiKey.update({ where: { id }, data: { status: "REVOKED" } });
}

/** List keys with metadata only — never the secret. */
export async function listApiKeys() {
  return db.apiKey.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      scopes: true,
      status: true,
      expiresAt: true,
      lastUsedAt: true,
      createdBy: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

/** Append one metadata row to ApiRequestLog — never bodies (PII rule). */
export async function recordApiRequest(input: {
  apiKeyId: string | null;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  ip: string | null;
  userAgent: string | null;
}) {
  await db.apiRequestLog.create({
    data: {
      apiKeyId: input.apiKeyId,
      method: input.method,
      path: input.path,
      statusCode: input.statusCode,
      durationMs: input.durationMs,
      ip: input.ip,
      userAgent: input.userAgent,
    },
  }).catch(() => undefined); // logging must never break the API
}

/**
 * Route wrapper: auth → scope → rate-limit → handler, then request logging.
 * Every v1 route uses this; the health endpoint stays public (no wrapper).
 */
export function withApiKey(
  handler: (
    request: NextRequest,
    context: { params: Record<string, string> }
  ) => Promise<Response>,
  scope: ApiScope,
  opts: { rateLimit?: number; rateWindowMs?: number } = {}
) {
  return async (
    request: NextRequest,
    context: { params: Record<string, string> } = { params: {} }
  ): Promise<Response> => {
    const started = Date.now();
    let apiKeyId: string | null = null;
    let statusCode = 500;
    try {
      const key = await requireApiKey(request);
      apiKeyId = key.id;
      requireScope(key, scope);

      const limit = opts.rateLimit ?? API_KEY_RATE_LIMIT;
      const windowMs = opts.rateWindowMs ?? API_KEY_RATE_WINDOW_MS;
      await assertWithinLimit(`api:${key.id}`, limit, windowMs);
      await recordRateLimitEvent(`api:${key.id}`);

      const response = await handler(request, context);
      statusCode = response.status;
      return response;
    } catch (err) {
      const appError = toAppError(err);
      statusCode = appError.statusCode;
      return jsonError(err);
    } finally {
      await recordApiRequest({
        apiKeyId,
        method: request.method,
        path: request.nextUrl.pathname,
        statusCode,
        durationMs: Date.now() - started,
        ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        userAgent: request.headers.get("user-agent"),
      });
    }
  };
}

/** Public endpoints (health) use this: no auth, no scope — logged as anonymous. */
export function withPublicLog(handler: (request: NextRequest) => Promise<Response>) {
  return async (request: NextRequest): Promise<Response> => {
    const started = Date.now();
    let statusCode = 500;
    try {
      const response = await handler(request);
      statusCode = response.status;
      return response;
    } catch (err) {
      const appError = toAppError(err);
      statusCode = appError.statusCode;
      return jsonError(err);
    } finally {
      await recordApiRequest({
        apiKeyId: null,
        method: request.method,
        path: request.nextUrl.pathname,
        statusCode,
        durationMs: Date.now() - started,
        ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        userAgent: request.headers.get("user-agent"),
      });
    }
  };
}

// Re-export jsonOk so route files can import one consistent envelope helper.
export { jsonOk };
