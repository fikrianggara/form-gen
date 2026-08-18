import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { useCleanDb } from "./helpers";
import {
  createApiKeyRequest,
  listApiKeyRequests,
  approveApiKeyRequest,
  denyApiKeyRequest,
} from "@/services/api-key.service";

useCleanDb();

async function makeAdmin() {
  return db.user.create({
    data: {
      email: "admin@formgen.test",
      name: "Admin",
      passwordHash: "x",
      role: "ADMIN",
    },
  });
}

describe("api-key portal requests", () => {
  it("creates a PENDING request with validated input", async () => {
    const request = await createApiKeyRequest({
      requesterName: "BPS Pipeline",
      requesterEmail: "integration@bps.go.id",
      organization: "BPS",
      purpose: "Automated data exchange",
      requestedScopes: ["questionnaires:read", "responses:read"],
    });
    expect(request.status).toBe("PENDING");
    expect(request.requestedScopes).toEqual(["questionnaires:read", "responses:read"]);
  });

  it("rejects invalid input", async () => {
    await expect(
      createApiKeyRequest({
        requesterName: "",
        requesterEmail: "bad-email",
        purpose: "x",
        requestedScopes: ["questionnaires:read"],
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    await expect(
      createApiKeyRequest({
        requesterName: "X",
        requesterEmail: "a@b.com",
        purpose: "x",
        requestedScopes: [],
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("lists requests, newest first", async () => {
    await createApiKeyRequest({
      requesterName: "First",
      requesterEmail: "a@b.com",
      purpose: "x",
      requestedScopes: ["masters:read"],
    });
    await createApiKeyRequest({
      requesterName: "Second",
      requesterEmail: "c@d.com",
      purpose: "y",
      requestedScopes: ["masters:read"],
    });
    const list = await listApiKeyRequests();
    expect(list).toHaveLength(2);
    expect(list[0].requesterName).toBe("Second"); // desc order
  });

  it("approve creates an ACTIVE key, links it, returns secret once", async () => {
    const request = await createApiKeyRequest({
      requesterName: "Approved Co",
      requesterEmail: "dev@co.com",
      organization: "Co",
      purpose: "integration",
      requestedScopes: ["reports:read"],
    });

    const admin = await makeAdmin();
    const { key, secret } = await approveApiKeyRequest(request.id, admin.id);
    expect(key.status).toBe("ACTIVE");
    expect(key.scopes).toEqual(["reports:read"]);
    expect(secret.startsWith("fg_live_")).toBe(true);

    const updated = await db.apiKeyRequest.findUnique({ where: { id: request.id } });
    expect(updated?.status).toBe("APPROVED");
    expect(updated?.approvedKeyId).toBe(key.id);
    expect(updated?.reviewedBy).toBe(admin.id);
    expect(updated?.reviewedAt).not.toBeNull();

    // The issued key must be usable by the API key lookup (hash matches).
    const { requireApiKey } = await import("@/services/api-key.service");
    const { NextRequest } = await import("next/server");
    const resolved = await requireApiKey(
      new NextRequest("http://localhost/api/v1/x", {
        headers: { authorization: `Bearer ${secret}` },
      })
    );
    expect(resolved.id).toBe(key.id);
  });

  it("cannot approve a non-pending request twice", async () => {
    const request = await createApiKeyRequest({
      requesterName: "Once",
      requesterEmail: "a@b.com",
      purpose: "x",
      requestedScopes: ["masters:read"],
    });
    await approveApiKeyRequest(request.id, (await makeAdmin()).id);
    await expect(approveApiKeyRequest(request.id, "admin-1")).rejects.toMatchObject({
      code: "REQUEST_NOT_PENDING",
    });
  });

  it("deny marks the request DENIED and creates no key", async () => {
    const request = await createApiKeyRequest({
      requesterName: "Nope Co",
      requesterEmail: "n@b.com",
      purpose: "x",
      requestedScopes: ["masters:read"],
    });
    await denyApiKeyRequest(request.id, (await makeAdmin()).id);

    const updated = await db.apiKeyRequest.findUnique({ where: { id: request.id } });
    expect(updated?.status).toBe("DENIED");
    expect(updated?.approvedKeyId).toBeNull();
    const keys = await db.apiKey.count();
    expect(keys).toBe(0);
  });
});
