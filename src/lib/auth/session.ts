import { SignJWT } from "jose/jwt/sign";
import { jwtVerify } from "jose/jwt/verify";
import type { Role } from "@prisma/client";

export const SESSION_COOKIE = "fg_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface SessionPayload {
  sub: string;
  email: string;
  name: string;
  role: Role;
  /** Organization membership (TKT-014); null for unassigned/legacy users. */
  organizationId: string | null;
}

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET environment variable is not set");
  }
  return new TextEncoder().encode(secret);
}

/** Sign a session payload into a signed JWT (HS256). */
export async function signSession(
  payload: SessionPayload,
  opts: { expiresInSeconds?: number } = {}
): Promise<string> {
  const ttl = opts.expiresInSeconds ?? SESSION_TTL_SECONDS;
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .sign(secretKey());
}

/**
 * Verify a session token. Returns the payload on success,
 * null for any invalid/expired/tampered token.
 */
export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ["HS256"],
    });
    const role = payload.role as Role | undefined;
    if (
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.name !== "string" ||
      (role !== "ADMIN" && role !== "OPERATOR")
    ) {
      return null;
    }
    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      role,
      // Legacy tokens without an org claim read as null (unassigned).
      organizationId:
        typeof payload.organizationId === "string" ? payload.organizationId : null,
    };
  } catch {
    return null;
  }
}
