"use client";

import { useState, useTransition } from "react";
import { createUserAction, updateUserAction, resetPasswordAction } from "@/lib/actions/dashboard";
import { Badge, Button, Card, Field, inputClass } from "@/components/ui";
import { useToast } from "@/components/toast";
import { IconPencil, IconKey, IconPlus } from "@/components/icons";

export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "OPERATOR";
  isActive: boolean;
  createdAt: string;
}

export function UsersPanel({ users }: { users: UserRow[] }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");

  const run = (fn: () => Promise<{ error?: string } | undefined>, success?: string) => {
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (res?.error) {
        setError(res.error);
        toast.error("Action failed", res.error);
      } else if (success) {
        toast.success(success);
      }
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
            }, "User created");
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
            <Button type="submit" disabled={pending}>
              <IconPlus size={15} className="mr-2" />
              Create user
            </Button>
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
                  {editId === u.id ? (
                    <div className="flex flex-col gap-1.5">
                      <input
                        type="text"
                        placeholder="Name"
                        className={`${inputClass} !px-2 !py-1 text-xs`}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                      <input
                        type="email"
                        placeholder="Email"
                        className={`${inputClass} !px-2 !py-1 text-xs`}
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                      />
                    </div>
                  ) : (
                    <>
                      <p className="font-medium text-gray-900">{u.name}</p>
                      <p className="text-xs text-gray-500">{u.email}</p>
                    </>
                  )}
                </td>
                <td className="px-4 py-3">
                  <select
                    defaultValue={u.role}
                    className="rounded-lg border border-gray-300 px-2 py-1 text-xs"
                    onChange={(e) => {
                      const role = e.target.value as "ADMIN" | "OPERATOR";
                      run(() => updateUserAction({ id: u.id, role }), `Role set to ${role}`);
                    }}
                  >
                    <option value="OPERATOR">OPERATOR</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() =>
                      run(
                        () => updateUserAction({ id: u.id, isActive: !u.isActive }),
                        u.isActive ? "User disabled" : "User enabled"
                      )
                    }
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
                        }, "Password reset");
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
                  ) : editId === u.id ? (
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        className="!px-2 !py-1 text-xs"
                        disabled={!editName.trim() || !editEmail.trim()}
                        onClick={() =>
                          run(
                            () =>
                              updateUserAction({
                                id: u.id,
                                name: editName.trim(),
                                email: editEmail.trim(),
                              }),
                            "User updated"
                          )
                        }
                      >
                        Save
                      </Button>
                      <Button type="button" variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => setEditId(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline"
                        onClick={() => {
                          setEditId(u.id);
                          setEditName(u.name);
                          setEditEmail(u.email);
                        }}
                      >
                        <IconPencil size={13} />
                        Edit
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline"
                        onClick={() => setResetId(u.id)}
                      >
                        <IconKey size={13} />
                        Reset password
                      </button>
                    </div>
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
