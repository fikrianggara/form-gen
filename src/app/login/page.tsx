"use client";

import { useEffect } from "react";
import { useFormState } from "react-dom";
import Link from "next/link";
import { loginAction, type LoginState } from "@/lib/actions/auth";
import { Button, Card, inputClass } from "@/components/ui";
import { useToast } from "@/components/toast";

const initialState: LoginState = { error: null };

export default function LoginPage() {
  const [state, formAction, pending] = useFormState(loginAction, initialState);
  const toast = useToast();

  useEffect(() => {
    if (state.error) toast.error("Sign in failed", state.error);
  }, [state.error, toast]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm p-8">
        <h1 className="text-2xl font-bold">Sign in to FormGen</h1>
        <p className="mt-1 text-sm text-gray-500">
          Admin and operator access only.
        </p>

        <form action={formAction} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-800" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className={inputClass}
              placeholder="admin@formgen.app"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-800" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className={inputClass}
              placeholder="••••••••"
            />
          </div>

          {state.error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
          )}

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-gray-400">
          <Link href="/" className="hover:text-gray-600">
            ← Back to home
          </Link>
        </p>
      </Card>
    </div>
  );
}
