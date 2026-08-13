"use client";

import { useState, useTransition } from "react";
import { createUserAction, updateUserAction, resetPasswordAction } from "@/lib/actions/dashboard";
import { Badge, Button, Card, Field, inputClass } from "@/components/ui";

export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "OPERATOR";
  isActive: boolean;
  createdAt: string;
}

export function UsersPanel({ users }: { users: UserRow[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const run = (fn: () => Promise<{ error?: string } | undefined>) => {
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (res?.error) setError(res.error);
    });
  };

  return (
    <div className="space-y-6">
      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <Card className="p-6">
        <h2 className="mb-4 font-semibold">Add user</h2>
        <form
          className="grid gap-4 sm:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run(async () => {
              const res = await createUserAction({
                email: String(fd.get("email") ?? ""),
                name: String(fd.get("name") ?? ""),
                password: String(fd.get("password") ?? ""),
                role: String(fd.get("role")) as "ADMIN" | "OPERATOR",
              });
              if (!res?.error) e.currentTarget.reset();
              return res;
            });
          }}
        >
          <Field label="Email" required>
            <input name="email" type="email" required className={inputClass} />
          </Field>
          <Field label="Name" required>
            <input name="name" required className={inputClass} />
          </Field>
          <Field label="Password" required hint="Min 8 characters">
            <input name="password" type="password" required minLength={8} className={inputClass} />
          </Field>
          <Field label="Role" required>
            <select name="role" className={inputClass} defaultValue="OPERATOR">
              <option value="OPERATOR">Operator</option>
              <option value="ADMIN">Admin</option>
            </select>
          </Field>
          <div className="sm:col-span-4 flex justify-end">
            <Button type="submit" disabled={pending}>Create user</Button>
          </div>
        </form>
      </Card>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{u.name}</p>
                  <p className="text-xs text-gray-500">{u.email}</p>
                </td>
                <td className="px-4 py-3">
                  <select
                    defaultValue={u.role}
                    className="rounded-lg border border-gray-300 px-2 py-1 text-xs"
                    onChange={(e) =>
                      run(() =>
                        updateUserAction({ id: u.id, role: e.target.value as "ADMIN" | "OPERATOR" })
                      )
                    }
                  >
                    <option value="OPERATOR">OPERATOR</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => run(() => updateUserAction({ id: u.id, isActive: !u.isActive }))}
                  >
                    <Badge tone={u.isActive ? "green" : "red"}>{u.isActive ? "active" : "disabled"}</Badge>
                  </button>
                </td>
                <td className="px-4 py-3 text-gray-500">{new Date(u.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  {resetId === u.id ? (
                    <form
                      className="flex items-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        run(async () => {
                          const res = await resetPasswordAction({ id: u.id, password: resetPassword });
                          if (!res?.error) {
                            setResetId(null);
                            setResetPassword("");
                          }
                          return res;
                        });
                      }}
                    >
                      <input
                        type="password"
                        minLength={8}
                        required
                        placeholder="new password"
                        className="w-40 rounded-lg border border-gray-300 px-2 py-1 text-xs"
                        value={resetPassword}
                        onChange={(e) => setResetPassword(e.target.value)}
                      />
                      <Button type="submit" variant="secondary" className="!px-2 !py-1 text-xs">
                        Save
                      </Button>
                      <Button type="button" variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => setResetId(null)}>
                        Cancel
                      </Button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="text-xs text-indigo-600 hover:underline"
                      onClick={() => setResetId(u.id)}
                    >
                      Reset password
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
