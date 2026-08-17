import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { useCleanDb } from "./helpers";
import {
  hashApiKey,
  generateApiKeySecret,
  keyPrefixFromSecret,
  API_KEY_PREFIX,
} from "@/lib/api-key";
import {
  issueApiKey,
  rotateApiKey,
  revokeApiKey,
  listApiKeys,
  requireApiKey,
  requireScope,
  withApiKey,
  recordApiRequest,
} from "@/services/api-key.service";

useCleanDb();

function authRequest(secret: string, path = "/api/v1/questionnaires"): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: "GET",
    headers: { authorization: `Bearer ${secret}` },
  });
}

describe("api-key.lib (hashing/prefix)", () => {
  it("hashes deterministically (SHA-256) and never stores the secret", () => {
    const secret = "fg_live_abc123";
    expect(hashApiKey(secret)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashApiKey(secret)).toBe(hashApiKey(secret));
    expect(hashApiKey(secret)).not.toContain(secret);
  });

  it("generates high-entropy prefixed secrets", () => {
    const secret = generateApiKeySecret();
    expect(secret.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(secret.length).toBeGreaterThan(API_KEY_PREFIX.length + 32);
    expect(generateApiKeySecret()).not.toBe(secret);
  });

  it("derives a short display prefix", () => {
    const secret = generateApiKeySecret();
    const prefix = keyPrefixFromSecret(secret);
    expect(secret.startsWith(prefix)).toBe(true);
    expect(prefix.length).toBeLessThan(secret.length);
  });
});

describe("issueApiKey / rotateApiKey / revokeApiKey / listApiKeys", () => {
  it("issues a key: secret returned once, only hash + prefix stored", async () => {
    const { key, secret } = await issueApiKey({
      name: "BPS pipeline",
      scopes: ["questionnaires:read", "responses:read"],
    });
    expect(key.keyHash).toBe(hashApiKey(secret));
    expect(key.keyPrefix).toBe(keyPrefixFromSecret(secret));
    expect(key.scopes).toEqual(["questionnaires:read", "responses:read"]);
    expect(key.status).toBe("ACTIVE");

    const stored = await db.apiKey.findUnique({ where: { id: key.id } });
    expect(stored?.keyHash).toBe(hashApiKey(secret));
    expect(stored?.keyHash).not.toBe(secret); // never plaintext
  });

  it("rejects a key with no valid scopes", async () => {
    await expect(issueApiKey({ name: "x", scopes: [] })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("rotates: new secret works, old secret no longer resolves", async () => {
    const { key, secret } = await issueApiKey({ name: "rot", scopes: ["masters:read"] });
    const { secret: newSecret } = await rotateApiKey(key.id);
    expect(newSecret).not.toBe(secret);

    await expect(requireApiKey(authRequest(secret))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const fresh = await requireApiKey(authRequest(newSecret));
    expect(fresh.id).toBe(key.id);
  });

  it("revokes: key stops working, list shows REVOKED", async () => {
    const { key, secret } = await issueApiKey({ name: "rev", scopes: ["masters:read"] });
    await revokeApiKey(key.id);

    await expect(requireApiKey(authRequest(secret))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const keys = await listApiKeys();
    expect(keys.find((k) => k.id === key.id)?.status).toBe("REVOKED");
    expect(keys[0]).not.toHaveProperty("keyHash"); // never expose secret material
  });

  it("expired keys are rejected", async () => {
    const { secret } = await issueApiKey({
      name: "exp",
      scopes: ["masters:read"],
      expiresAt: new Date(Date.now() - 1000),
    });
    await expect(requireApiKey(authRequest(secret))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("requireApiKey", () => {
  it("rejects missing or malformed Authorization", async () => {
    await expect(
      requireApiKey(new NextRequest("http://localhost/api/v1/x"))
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      requireApiKey(
        new NextRequest("http://localhost/api/v1/x", {
          headers: { authorization: "Basic abc" },
        })
      )
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects unknown keys", async () => {
    await expect(requireApiKey(authRequest("fg_live_doesnotexist"))).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("accepts a valid key and touches lastUsedAt", async () => {
    const { key, secret } = await issueApiKey({ name: "ok", scopes: ["reports:read"] });
    const resolved = await requireApiKey(authRequest(secret));
    expect(resolved.id).toBe(key.id);
    expect(resolved.lastUsedAt).not.toBeNull();
  });
});

describe("requireScope", () => {
  it("passes when the key has the scope", async () => {
    const { key } = await issueApiKey({ name: "s", scopes: ["reports:read"] });
    expect(() => requireScope(key, "reports:read")).not.toThrow();
  });

  it("throws 403 when the key lacks the scope", async () => {
    const { key } = await issueApiKey({ name: "s", scopes: ["reports:read"] });
    expect(() => requireScope(key, "questionnaires:read")).toThrowError(
      expect.objectContaining({ code: "SCOPE_FORBIDDEN", statusCode: 403 })
    );
  });
});

describe("withApiKey wrapper", () => {
  it("returns 401 for missing key", async () => {
    const wrapped = withApiKey(async () => new Response("ok"), "masters:read");
    const res = await wrapped(new NextRequest("http://localhost/api/v1/masters"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when key lacks scope", async () => {
    const { secret } = await issueApiKey({ name: "w", scopes: ["masters:read"] });
    const wrapped = withApiKey(async () => new Response("ok"), "responses:read");
    const res = await wrapped(authRequest(secret, "/api/v1/responses"));
    expect(res.status).toBe(403);
  });

  it("passes through a successful handler and logs the request", async () => {
    const { secret } = await issueApiKey({ name: "w", scopes: ["masters:read"] });
    const wrapped = withApiKey(
      async () => new Response(JSON.stringify({ data: { ok: true } }), { status: 200 }),
      "masters:read"
    );
    const res = await wrapped(authRequest(secret, "/api/v1/masters"));
    expect(res.status).toBe(200);

    const logs = await db.apiRequestLog.findMany();
    expect(logs.length).toBe(1);
    expect(logs[0].path).toBe("/api/v1/masters");
    expect(logs[0].statusCode).toBe(200);
    expect(logs[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it("rate-limits a key and returns the stable 429", async () => {
    const { secret } = await issueApiKey({ name: "rl", scopes: ["masters:read"] });
    const wrapped = withApiKey(async () => new Response("ok"), "masters:read", {
      rateLimit: 2,
      rateWindowMs: 60_000,
    });
    expect((await wrapped(authRequest(secret))).status).toBe(200);
    expect((await wrapped(authRequest(secret))).status).toBe(200);
    expect((await wrapped(authRequest(secret))).status).toBe(429);
  });
});

describe("recordApiRequest", () => {
  it("writes metadata only (never bodies)", async () => {
    await recordApiRequest({
      apiKeyId: null,
      method: "GET",
      path: "/api/v1/health",
      statusCode: 200,
      durationMs: 12,
      ip: "1.2.3.4",
      userAgent: "curl/8",
    });
    const rows = await db.apiRequestLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].apiKeyId).toBeNull();
    expect(rows[0].ip).toBe("1.2.3.4");
    expect(rows[0]).not.toHaveProperty("body");
  });
});
