import { describe, it, expect } from "vitest";
import { signSession, verifySession, SESSION_COOKIE } from "@/lib/auth/session";
import type { SessionPayload } from "@/lib/auth/session";
import type { Role } from "@prisma/client";

const payload: SessionPayload = {
  sub: "user_123",
  email: "admin@example.com",
  name: "Admin",
  role: "ADMIN" as Role,
  organizationId: "org_123",
};

describe("session JWT", () => {
  it("signs and verifies a round trip", async () => {
    const token = await signSession(payload);
    const verified = await verifySession(token);
    expect(verified).toMatchObject(payload);
  });

  it("reads legacy tokens (no org claim) as unassigned (organizationId null)", async () => {
    const legacy = await signSession({
      sub: "user_old",
      email: "old@example.com",
      name: "Old",
      role: "OPERATOR" as Role,
      organizationId: null,
    });
    const verified = await verifySession(legacy);
    expect(verified?.organizationId).toBeNull();
    expect(verified?.sub).toBe("user_old");
  });

  it("returns null for a tampered token", async () => {
    const token = await signSession(payload);
    const [head, body, sig] = token.split(".");
    const tampered = `${head}.${body}.${sig.slice(0, -2)}xx`;
    expect(await verifySession(tampered)).toBeNull();
  });

  it("returns null for garbage input", async () => {
    expect(await verifySession("not-a-jwt")).toBeNull();
  });

  it("returns null for an expired token", async () => {
    const token = await signSession(payload, { expiresInSeconds: 1 });
    await new Promise((r) => setTimeout(r, 1100));
    expect(await verifySession(token)).toBeNull();
  });

  it("exports the cookie name", () => {
    expect(SESSION_COOKIE).toBe("fg_session");
  });
});
