import { NextResponse } from "next/server";
import { toAppError } from "@/lib/errors";
import { verifySession, SESSION_COOKIE, type SessionPayload } from "@/lib/auth/session";
import { isUserActive } from "@/services/user.service";
import { cookies } from "next/headers";

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function jsonError(err: unknown): NextResponse {
  const appError = toAppError(err);
  return NextResponse.json(
    { error: { code: appError.code, message: appError.message } },
    { status: appError.statusCode }
  );
}

/** Read the current session from the request cookie (null when anonymous).
 * TKT-029: also rejects sessions whose user has been disabled, so a disabled
 * user's existing session dies on the next protected request (middleware is
 * UX only; this is the enforcement point). */
export async function getSession(): Promise<SessionPayload | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await verifySession(token);
  if (!session) return null;
  if (!(await isUserActive(session.sub))) return null;
  return session;
}

/** Validate a respondent token: a reasonably long opaque string. */
export function isValidRespondentToken(token: unknown): token is string {
  return typeof token === "string" && token.length >= 8 && token.length <= 128;
}
