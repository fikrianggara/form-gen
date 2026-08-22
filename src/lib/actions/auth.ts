"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { authenticate, registerPublicUser } from "@/services/user.service";
import {
  assertLoginAllowed,
  recordLoginFailure,
  recordLoginSuccess,
  assertWithinLimit,
  recordRateLimitEvent,
  REGISTER_MAX_PER_IP,
  REGISTER_WINDOW_MS,
} from "@/services/rate-limit.service";
import { signSession, SESSION_COOKIE } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";

export interface LoginState {
  error: string | null;
}

/** Best-effort client IP from request headers (proxied deployments set these). */
function clientIp(): string {
  const fwd = headers().get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return headers().get("x-real-ip") ?? "unknown";
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const ip = clientIp();

  try {
    await assertLoginAllowed(email, ip);
    const user = await authenticate(email, password);
    if (!user) {
      await recordLoginFailure(email, ip);
      return { error: "Invalid username, email or password" };
    }
    await recordLoginSuccess(email, ip);
    const token = await signSession({
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
    });
    cookies().set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
  } catch (err) {
    return { error: err instanceof AppError ? err.message : "Login failed" };
  }

  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  cookies().delete(SESSION_COOKIE);
  redirect("/login");
}

// ------------------------------------------------------------- TKT-051: register

export interface RegisterState {
  error: string | null;
  /** True once the account was created and awaits admin activation. */
  success?: boolean;
}

export async function registerAction(
  _prev: RegisterState,
  formData: FormData
): Promise<RegisterState> {
  const username = String(formData.get("username") ?? "");
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const ip = clientIp();

  try {
    await assertWithinLimit(`register:${ip}`, REGISTER_MAX_PER_IP, REGISTER_WINDOW_MS);
    await registerPublicUser({ username, email, password });
    await recordRateLimitEvent(`register:${ip}`);
    return { error: null, success: true };
  } catch (err) {
    return { error: err instanceof AppError ? err.message : "Registration failed" };
  }
}
