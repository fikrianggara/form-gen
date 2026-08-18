import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { useCleanDb } from "./helpers";
import {
  issueApiKey,
  createApiKeyRequest,
  approveApiKeyRequest,
  revokeApiKey,
  recordApiRequest,
} from "@/services/api-key.service";
import { hasPermission } from "@/lib/auth/rbac";

useCleanDb();

describe("admin api-key dashboard", () => {
  it("exposes MANAGE_API_KEYS to ADMIN only", () => {
    expect(hasPermission({ role: "ADMIN" }, "MANAGE_API_KEYS")).toBe(true);
    expect(hasPermission({ role: "OPERATOR" }, "MANAGE_API_KEYS")).toBe(false);
    expect(hasPermission(null, "MANAGE_API_KEYS")).toBe(false);
  });

  it("counts usage per key from ApiRequestLog", async () => {
    const admin = await db.user.create({
      data: { email: "a@x.test", name: "A", passwordHash: "x", role: "ADMIN" },
    });
    const { key } = await issueApiKey({ name: "usage", scopes: ["masters:read"], createdBy: admin.id });
    const { key: key2 } = await issueApiKey({ name: "idle", scopes: ["masters:read"], createdBy: admin.id });

    await recordApiRequest({
      apiKeyId: key.id,
      method: "GET",
      path: "/api/v1/masters",
      statusCode: 200,
      durationMs: 5,
      ip: "1.2.3.4",
      userAgent: "test",
    });
    await recordApiRequest({
      apiKeyId: key.id,
      method: "GET",
      path: "/api/v1/masters",
      statusCode: 200,
      durationMs: 6,
      ip: "1.2.3.4",
      userAgent: "test",
    });

    // Simulate the admin session read by calling the service internals directly:
    const { listApiKeys, listApiKeyRequests } = await import("@/services/api-key.service");
    const usage = await db.apiRequestLog.groupBy({
      by: ["apiKeyId"],
      _count: { _all: true },
      where: { apiKeyId: { not: null } },
    });
    const usageMap = new Map(usage.map((u) => [u.apiKeyId, u._count._all]));
    expect(usageMap.get(key.id)).toBe(2);
    expect(usageMap.get(key2.id)).toBeUndefined();

    // Sanity: both keys exist in the list, neither exposes the secret.
    const keys = await listApiKeys();
    expect(keys.map((k) => k.id)).toContain(key.id);
    expect(keys.map((k) => k.id)).toContain(key2.id);
    expect(keys[0]).not.toHaveProperty("keyHash");
    const requests = await listApiKeyRequests();
    expect(requests).toHaveLength(0);
  });

  it("approve→revoke lifecycle works through the service", async () => {
    const admin = await db.user.create({
      data: { email: "b@x.test", name: "B", passwordHash: "x", role: "ADMIN" },
    });
    const request = await createApiKeyRequest({
      requesterName: "Partner",
      requesterEmail: "p@x.test",
      purpose: "data exchange",
      requestedScopes: ["reports:read"],
    });
    const { key, secret } = await approveApiKeyRequest(request.id, admin.id);
    expect(key.status).toBe("ACTIVE");
    expect(secret).toMatch(/^fg_live_/);

    await revokeApiKey(key.id);
    const revoked = await db.apiKey.findUnique({ where: { id: key.id } });
    expect(revoked?.status).toBe("REVOKED");
  });
});
