import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

/** Max failed login attempts per (email, ip) before a lockout. */
export const LOGIN_MAX_FAILURES = 5;
/** Lockout window: failures older than this no longer count. */
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

const LOGIN_LOCKED = new AppError(
  "Too many login attempts. Please try again later.",
  429,
  "RATE_LIMITED"
);

/**
 * Brute-force guard for login endpoints. Failures are recorded per (email, ip)
 * in the `LoginAttempt` table; once the failure count within the window reaches
 * LOGIN_MAX_FAILURES, further attempts are rejected with 429 until the window
 * slides past the oldest failures.
 *
 * Shared by the dashboard login and, once respondent accounts land (TKT-001),
 * the respondent login flow.
 */
export async function assertLoginAllowed(
  email: string,
  ip: string
): Promise<void> {
  const since = new Date(Date.now() - LOGIN_WINDOW_MS);
  const count = await db.loginAttempt.count({
    where: {
      email: email.toLowerCase(),
      ip,
      createdAt: { gte: since },
    },
  });
  if (count >= LOGIN_MAX_FAILURES) {
    throw LOGIN_LOCKED;
  }
}

/** Record a failed attempt for (email, ip). */
export async function recordLoginFailure(
  email: string,
  ip: string
): Promise<void> {
  await db.loginAttempt.create({
    data: { email: email.toLowerCase(), ip },
  });
}

/** Reset the failure counter after a successful login. */
export async function recordLoginSuccess(
  email: string,
  ip: string
): Promise<void> {
  await db.loginAttempt.deleteMany({
    where: { email: email.toLowerCase(), ip },
  });
}

// ---------------------------------------------------------- generic (TKT-023)

/** Stable 429 error shape used by every rate-limited endpoint. */
export const RATE_LIMITED = new AppError(
  "Too many requests. Please try again later.",
  429,
  "RATE_LIMITED"
);

/**
 * Windowed counter over the RateLimitEvent table. Throws the stable 429
 * RATE_LIMITED error once `limit` events for `key` exist within `windowMs`.
 */
export async function assertWithinLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<void> {
  const since = new Date(Date.now() - windowMs);
  const count = await db.rateLimitEvent.count({
    where: { key, createdAt: { gte: since } },
  });
  if (count >= limit) {
    throw RATE_LIMITED;
  }
}

/** Record one event for a rate-limit key. */
export async function recordRateLimitEvent(key: string): Promise<void> {
  await db.rateLimitEvent.create({ data: { key } });
}

/**
 * Response submission throttling (TKT-023). Anonymous bots can mint fresh
 * respondent tokens, so we limit on three orthogonal keys:
 *   1. (respondentToken, IP) — the natural per-respondent cadence,
 *   2. IP alone — catches token-minting bots,
 *   3. per-questionnaire — a global cap per hour for ACTIVE questionnaires.
 * All are windowed; constants below are the documented defaults.
 */
export const RESPONSE_WINDOW_MS = 60 * 1000;
export const RESPONSE_MAX_PER_TOKEN_IP = 60;
export const RESPONSE_MAX_PER_IP = 120;
export const RESPONSE_Q_WINDOW_MS = 60 * 60 * 1000;
export const RESPONSE_MAX_PER_QUESTIONNAIRE = 10000;

export async function assertResponseSubmissionAllowed(
  respondentToken: string,
  ip: string,
  questionnaireId: string
): Promise<void> {
  await assertWithinLimit(
    `submit:${respondentToken}:${ip}`,
    RESPONSE_MAX_PER_TOKEN_IP,
    RESPONSE_WINDOW_MS
  );
  await assertWithinLimit(`submit:ip:${ip}`, RESPONSE_MAX_PER_IP, RESPONSE_WINDOW_MS);
  await assertWithinLimit(
    `submit:q:${questionnaireId}`,
    RESPONSE_MAX_PER_QUESTIONNAIRE,
    RESPONSE_Q_WINDOW_MS
  );
}

export async function recordResponseSubmission(
  respondentToken: string,
  ip: string,
  questionnaireId: string
): Promise<void> {
  await recordRateLimitEvent(`submit:${respondentToken}:${ip}`);
  await recordRateLimitEvent(`submit:ip:${ip}`);
  await recordRateLimitEvent(`submit:q:${questionnaireId}`);
}

// ------------------------------------------------------------ TKT-051: registration

/** Registration spam guard: per-IP window (10/hour). */
export const REGISTER_MAX_PER_IP = 10;
export const REGISTER_WINDOW_MS = 60 * 60 * 1000;
