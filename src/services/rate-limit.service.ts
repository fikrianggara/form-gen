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
