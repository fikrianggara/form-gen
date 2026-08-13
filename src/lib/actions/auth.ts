"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authenticate } from "@/services/user.service";
import { signSession, SESSION_COOKIE } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";

export interface LoginState {
  error: string | null;
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  try {
    const user = await authenticate(email, password);
    if (!user) {
      return { error: "Invalid email or password" };
    }
    const token = await signSession({
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
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
