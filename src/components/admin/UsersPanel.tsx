"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createUserAction, updateUserAction, resetPasswordAction } from "@/lib/actions/dashboard";
import { Badge, Button, Card, Field, inputClass } from "@/components/ui";
import { useToast } from "@/components/toast";
import { IconMore, IconPencil, IconKey, IconPlus, IconCheck, IconBan } from "@/components/icons";

export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "OPERATOR";
  isActive: boolean;
  createdAt: string;
}

/** Per-row kebab action menu (TKT-028): Edit / Reset password / Enable-Disable.
 * Closes on outside click / Escape. Disable uses an inline confirm state,
 * mirroring ResponseActionsMenu. */
function UserActionsMenu({
  user,
  onEdit,
  onResetPassword,
}: {
  user: UserRow;
  onEdit: () => void;
  onResetPassword: () => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    setConfirmDisable(false);
  };

  const runToggle = () => {
    startTransition(async () => {
      const res = await updateUserAction({ id: user.id, isActive: !user.isActive });
      if (res?.error) {
        toast.error("Action failed", res.error);
      } else {
        toast.success(user.isActive ? "User disabled" : "User enabled");
      }
      close();
    });
  };

  const target = user.isActive ? "Disable" : "Enable";

  return (
    <div ref={ref} className="relative inline-block text-left">
      <button
        type="button"
        aria-label={`Actions for ${user.name}`}
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
      >
        <IconMore size={16} />
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
          {confirmDisable ? (
            <>
              <p className="px-3 py-2 text-xs font-medium text-gray-700">
                {user.isActive ? `Disable ${user.name}?` : `Enable ${user.name}?`}
              </p>
              <div className="flex gap-1 px-2 pb-1">
                <button
                  type="button"
                  disabled={pending}
                  onClick={runToggle}
                  className={`flex-1 rounded-lg px-2 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50 ${
                    user.isActive ? "bg-red-600" : "bg-emerald-600"
                  }`}
                >
                  {target}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setConfirmDisable(false)}
                  className="flex-1 rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  close();
                  onEdit();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                <IconPencil size={14} />
                Edit
              </button>
              <button
                type="button"
                onClick={() => {
                  close();
                  onResetPassword();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                <IconKey size={14} />
                Reset password
              </button>
              <button
                type="button"
                onClick={() => setConfirmDisable(true)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                  user.isActive ? "text-red-600" : "text-emerald-700"
                }`}
              >
                {user.isActive ? <IconBan size={14} /> : <IconCheck size={14} />}
                {target}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
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
            // Capture the form BEFORE the async gap: React nulls
            // e.currentTarget once the handler returns (TKT-027).
            const form = e.currentTarget;
            const fd = new FormData(form);
            run(async () => {
              const res = await createUserAction({
                email: String(fd.get("email") ?? ""),
                name: String(fd.get("name") ?? ""),
                password: String(fd.get("password") ?? ""),
                role: String(fd.get("role")) as "ADMIN" | "OPERATOR",
              });
              if (!res?.error) form.reset();
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

      <div className="overflow-visible rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3 first:rounded-tl-xl">User</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3 text-right last:rounded-tr-xl">Actions</th>
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
                  {/* TKT-028: display-only badge — the toggle lives in the actions menu. */}
                  <Badge tone={u.isActive ? "green" : "red"}>{u.isActive ? "active" : "disabled"}</Badge>
                </td>
                <td className="px-4 py-3 text-gray-500">{new Date(u.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  {resetId === u.id ? (
                    <form
                      className="flex items-center justify-end gap-2"
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
                    <div className="flex items-center justify-end gap-2">
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
                    <div className="flex justify-end">
                      <UserActionsMenu
                        user={u}
                        onEdit={() => {
                          setEditId(u.id);
                          setEditName(u.name);
                          setEditEmail(u.email);
                        }}
                        onResetPassword={() => setResetId(u.id)}
                      />
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
