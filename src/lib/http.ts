import { NextResponse } from "next/server";
import { toAppError } from "@/lib/errors";
import { verifySession, SESSION_COOKIE, type SessionPayload } from "@/lib/auth/session";
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

/** Read the current session from the request cookie (null when anonymous). */
export async function getSession(): Promise<SessionPayload | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

/** Validate a respondent token: a reasonably long opaque string. */
export function isValidRespondentToken(token: unknown): token is string {
  return typeof token === "string" && token.length >= 8 && token.length <= 128;
}
