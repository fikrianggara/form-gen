"use client";

import { useFormState } from "react-dom";
import Link from "next/link";
import { registerAction, type RegisterState } from "@/lib/actions/auth";
import { Button, Card, inputClass } from "@/components/ui";
import { IconLogIn } from "@/components/icons";

const initialState: RegisterState = { error: null };

export default function RegisterPage() {
  const [state, formAction] = useFormState(registerAction, initialState);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm p-8">
        <h1 className="text-2xl font-bold">Create an account</h1>
        <p className="mt-1 text-sm text-gray-500">
          Register with a username, email and password. Your account is inactive
          until an admin activates it.
        </p>

        {state.success ? (
          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-medium text-emerald-900">Account created</p>
            <p className="mt-1 text-sm text-emerald-700">
              Your account awaits admin activation. You will be able to sign in
              once an administrator activates it.
            </p>
            <Link
              href="/login"
              className="mt-4 inline-block text-sm font-medium text-emerald-800 underline"
            >
              Back to sign in →
            </Link>
          </div>
        ) : (
          <form action={formAction} className="mt-6 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-800" htmlFor="username">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                minLength={3}
                maxLength={30}
                autoComplete="username"
                className={inputClass}
                placeholder="e.g. budi.santoso"
              />
            </div>
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
                placeholder="you@example.com"
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
                minLength={8}
                autoComplete="new-password"
                className={inputClass}
                placeholder="At least 8 characters"
              />
            </div>

            {state.error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
            )}

            <Button type="submit" className="w-full">
              <IconLogIn className="mr-2 h-4 w-4" />
              Create account
            </Button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-gray-500">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-indigo-600 hover:underline">
            Sign in
          </Link>
        </p>
      </Card>
    </div>
  );
}
