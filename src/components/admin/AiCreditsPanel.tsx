"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  setGlobalDailyDefaultAction,
  setUserDailyAllowanceAction,
  adjustUserCreditBalanceAction,
} from "@/lib/actions/credits";
import { Badge, Button, Card, Field, inputClass } from "@/components/ui";
import { useToast } from "@/components/toast";
import { IconMore, IconPencil, IconPlus, IconSparkles } from "@/components/icons";
import type {
  AdminCreditDashboardData,
  UserCreditOverview,
} from "@/services/credit.service";

interface Props {
  initialData: AdminCreditDashboardData;
}

export function AiCreditsPanel({ initialData }: Props) {
  const toast = useToast();
  const [data, setData] = useState<AdminCreditDashboardData>(initialData);
  const [globalModalOpen, setGlobalModalOpen] = useState(false);
  const [allowanceUser, setAllowanceUser] = useState<UserCreditOverview | null>(null);
  const [adjustUser, setAdjustUser] = useState<UserCreditOverview | null>(null);

  // Global default form state
  const [globalValue, setGlobalValue] = useState(data.globalDailyDefault);
  const [globalPending, startGlobalTransition] = useTransition();

  // Per-user allowance form state
  const [allowanceValue, setAllowanceValue] = useState<string>("");
  const [allowancePending, startAllowanceTransition] = useTransition();

  // Balance adjustment form state
  const [adjDelta, setAdjDelta] = useState<number>(5);
  const [adjReason, setAdjReason] = useState<string>("");
  const [adjPending, startAdjTransition] = useTransition();

  const handleUpdateGlobalDefault = (e: React.FormEvent) => {
    e.preventDefault();
    startGlobalTransition(async () => {
      const res = await setGlobalDailyDefaultAction({ dailyDefault: globalValue });
      if (res.error) {
        toast.error("Failed to update default", res.error);
      } else {
        toast.success(`Global daily default set to ${res.dailyDefault} credits`);
        setData((prev) => ({
          ...prev,
          globalDailyDefault: res.dailyDefault ?? prev.globalDailyDefault,
          users: prev.users.map((u) => {
            if (!u.isOverride) {
              const allowance = res.dailyDefault ?? u.allowance;
              return {
                ...u,
                allowance,
                balanceToday: Math.max(0, allowance - u.usedToday + u.adjustmentsToday),
              };
            }
            return u;
          }),
        }));
        setGlobalModalOpen(false);
      }
    });
  };

  const handleSaveAllowance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!allowanceUser) return;
    const parsed = allowanceValue.trim() === "" ? null : parseInt(allowanceValue, 10);
    if (parsed !== null && (isNaN(parsed) || parsed < 0)) {
      toast.error("Invalid allowance", "Allowance must be a non-negative integer or empty for default.");
      return;
    }

    startAllowanceTransition(async () => {
      const res = await setUserDailyAllowanceAction({
        userId: allowanceUser.id,
        allowance: parsed,
      });
      if (res.error) {
        toast.error("Failed to set allowance", res.error);
      } else {
        toast.success(
          parsed === null
            ? `Allowance reset to global default (${data.globalDailyDefault})`
            : `Allowance set to ${parsed} credits/day`
        );
        setData((prev) => ({
          ...prev,
          users: prev.users.map((u) => {
            if (u.id === allowanceUser.id) {
              const allowance = parsed ?? prev.globalDailyDefault;
              return {
                ...u,
                allowance,
                isOverride: parsed !== null,
                balanceToday: Math.max(0, allowance - u.usedToday + u.adjustmentsToday),
              };
            }
            return u;
          }),
        }));
        setAllowanceUser(null);
      }
    });
  };

  const handleSaveAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustUser) return;
    if (!adjReason.trim()) {
      toast.error("Reason required", "Please provide a reason for the adjustment.");
      return;
    }

    startAdjTransition(async () => {
      const res = await adjustUserCreditBalanceAction({
        userId: adjustUser.id,
        delta: adjDelta,
        reason: adjReason,
      });
      if (res.error) {
        toast.error("Failed to adjust balance", res.error);
      } else {
        toast.success(
          adjDelta > 0
            ? `Added ${adjDelta} credits to ${adjustUser.name}'s balance today`
            : `Deducted ${Math.abs(adjDelta)} credits from ${adjustUser.name}'s balance today`
        );
        setData((prev) => ({
          ...prev,
          users: prev.users.map((u) => {
            if (u.id === adjustUser.id) {
              const newAdj = u.adjustmentsToday + adjDelta;
              return {
                ...u,
                adjustmentsToday: newAdj,
                balanceToday: Math.max(0, u.allowance - u.usedToday + newAdj),
              };
            }
            return u;
          }),
          recentAdjustments: [
            {
              id: res.adjustmentId ?? Math.random().toString(),
              userId: adjustUser.id,
              userName: adjustUser.name,
              userEmail: adjustUser.email,
              date: new Date().toISOString().slice(0, 10),
              delta: adjDelta,
              reason: adjReason,
              createdBy: "admin",
              createdAt: new Date().toISOString(),
            },
            ...prev.recentAdjustments,
          ],
        }));
        setAdjustUser(null);
        setAdjReason("");
      }
    });
  };

  return (
    <div className="space-y-8">
      {/* Top Banner / Global Default Card */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-5 sm:col-span-2 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <IconSparkles size={18} />
              </span>
              <h2 className="text-base font-semibold text-gray-900">
                Global Daily Allowance
              </h2>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              Default daily AI credits allocated to every user without a specific override. Resets daily.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-2xl font-bold text-gray-900">
                {data.globalDailyDefault}
              </div>
              <div className="text-xs text-gray-500">credits / day</div>
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                setGlobalValue(data.globalDailyDefault);
                setGlobalModalOpen(true);
              }}
              className="gap-1.5"
            >
              <IconPencil size={14} />
              Edit
            </Button>
          </div>
        </Card>

        <Card className="p-5 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Active Cost Schedule
            </h3>
            <ul className="mt-3 space-y-1.5 text-xs text-gray-600">
              <li className="flex justify-between">
                <span>Generate Questionnaire</span>
                <span className="font-semibold text-gray-900">5 credits</span>
              </li>
              <li className="flex justify-between">
                <span>AI Add Question</span>
                <span className="font-semibold text-gray-900">2 credits</span>
              </li>
              <li className="flex justify-between">
                <span>AI Edit Question</span>
                <span className="font-semibold text-gray-900">1 credit</span>
              </li>
            </ul>
          </div>
        </Card>
      </div>

      {/* User Credits Table */}
      <Card className="overflow-visible">
        <div className="border-b border-gray-200 px-6 py-4">
          <h3 className="text-base font-semibold text-gray-900">
            User Credit Allowances & Today&apos;s Balances
          </h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Manage per-user daily allowances or add one-off dated adjustments for today.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold text-gray-700">
              <tr>
                <th className="px-6 py-3">User</th>
                <th className="px-6 py-3">Role</th>
                <th className="px-6 py-3">Daily Allowance</th>
                <th className="px-6 py-3 text-right">Used Today</th>
                <th className="px-6 py-3 text-right">Adjustments</th>
                <th className="px-6 py-3 text-right">Balance Today</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data.users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50/50">
                  <td className="px-6 py-3.5">
                    <div className="font-medium text-gray-900">{u.name}</div>
                    <div className="text-xs text-gray-400">{u.email}</div>
                  </td>
                  <td className="px-6 py-3.5">
                    <Badge tone="gray">{u.role}</Badge>
                  </td>
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">{u.allowance}</span>
                      {u.isOverride ? (
                        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                          Custom
                        </span>
                      ) : (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                          Default
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-3.5 text-right font-medium text-gray-700">
                    {u.usedToday}
                  </td>
                  <td className="px-6 py-3.5 text-right">
                    {u.adjustmentsToday > 0 ? (
                      <span className="font-semibold text-emerald-600">
                        +{u.adjustmentsToday}
                      </span>
                    ) : u.adjustmentsToday < 0 ? (
                      <span className="font-semibold text-red-600">
                        {u.adjustmentsToday}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-3.5 text-right">
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ${
                        u.balanceToday > 0
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-red-50 text-red-700"
                      }`}
                    >
                      {u.balanceToday}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-right">
                    <UserCreditActionsMenu
                      user={u}
                      onSetAllowance={() => {
                        setAllowanceUser(u);
                        setAllowanceValue(u.isOverride ? String(u.allowance) : "");
                      }}
                      onAdjustBalance={() => {
                        setAdjustUser(u);
                        setAdjDelta(5);
                        setAdjReason("");
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Adjustments Audit Table */}
      <Card>
        <div className="border-b border-gray-200 px-6 py-4">
          <h3 className="text-base font-semibold text-gray-900">
            Recent Credit Adjustments (Audit Log)
          </h3>
          <p className="mt-0.5 text-xs text-gray-500">
            History of manual top-ups and revocations recorded by administrators.
          </p>
        </div>

        {data.recentAdjustments.length === 0 ? (
          <div className="p-6 text-center text-xs text-gray-500">
            No credit adjustments have been recorded.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold text-gray-700">
                <tr>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">User</th>
                  <th className="px-6 py-3">Delta</th>
                  <th className="px-6 py-3">Reason</th>
                  <th className="px-6 py-3">Admin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {data.recentAdjustments.map((adj) => (
                  <tr key={adj.id} className="hover:bg-gray-50/50">
                    <td className="px-6 py-3 text-xs text-gray-500">{adj.date}</td>
                    <td className="px-6 py-3">
                      <div className="font-medium text-gray-900">{adj.userName}</div>
                      <div className="text-xs text-gray-400">{adj.userEmail}</div>
                    </td>
                    <td className="px-6 py-3 font-semibold">
                      {adj.delta > 0 ? (
                        <span className="text-emerald-600">+{adj.delta}</span>
                      ) : (
                        <span className="text-red-600">{adj.delta}</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-gray-700">{adj.reason}</td>
                    <td className="px-6 py-3 text-xs text-gray-500">
                      {adj.createdBy ?? "System"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Global Default Modal */}
      {globalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900">
              Set Global Daily AI Credits
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              This default allowance will apply to all users without a per-user override immediately.
            </p>
            <form onSubmit={handleUpdateGlobalDefault} className="mt-4 space-y-4">
              <Field label="Daily Default Credits" required>
                <input
                  type="number"
                  min="0"
                  max="10000"
                  value={globalValue}
                  onChange={(e) => setGlobalValue(parseInt(e.target.value, 10) || 0)}
                  className={inputClass}
                  required
                />
              </Field>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setGlobalModalOpen(false)}
                  disabled={globalPending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={globalPending}>
                  {globalPending ? "Saving..." : "Save Default"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Per-User Allowance Modal */}
      {allowanceUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900">
              Set Allowance: {allowanceUser.name}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Set a daily custom allowance for this user, or leave empty to use the global default ({data.globalDailyDefault}).
            </p>
            <form onSubmit={handleSaveAllowance} className="mt-4 space-y-4">
              <Field
                label="Daily Credit Allowance"
                hint={`Leave empty to inherit global default (${data.globalDailyDefault})`}
              >
                <input
                  type="number"
                  min="0"
                  max="10000"
                  placeholder={`Default (${data.globalDailyDefault})`}
                  value={allowanceValue}
                  onChange={(e) => setAllowanceValue(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setAllowanceUser(null)}
                  disabled={allowancePending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={allowancePending}>
                  {allowancePending ? "Saving..." : "Save Allowance"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Balance Adjustment Modal */}
      {adjustUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900">
              Adjust Balance: {adjustUser.name}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Add or remove credits for <strong>today only</strong>. An audit log entry will be recorded.
            </p>
            <form onSubmit={handleSaveAdjustment} className="mt-4 space-y-4">
              <Field label="Credit Delta (positive to add, negative to revoke)" required>
                <input
                  type="number"
                  value={adjDelta}
                  onChange={(e) => setAdjDelta(parseInt(e.target.value, 10) || 0)}
                  className={inputClass}
                  required
                />
              </Field>
              <Field label="Reason" required hint="e.g. VIP top-up, workshop quota, manual fix">
                <input
                  type="text"
                  placeholder="Enter reason for adjustment..."
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  className={inputClass}
                  required
                />
              </Field>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setAdjustUser(null)}
                  disabled={adjPending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={adjPending}>
                  {adjPending ? "Saving..." : "Apply Adjustment"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function UserCreditActionsMenu({
  user,
  onSetAllowance,
  onAdjustBalance,
}: {
  user: UserCreditOverview;
  onSetAllowance: () => void;
  onAdjustBalance: () => void;
}) {
  const [open, setOpen] = useState(false);
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
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onSetAllowance();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <IconPencil size={14} className="text-gray-400" />
            Set daily allowance
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onAdjustBalance();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <IconPlus size={14} className="text-gray-400" />
            Adjust balance (today)
          </button>
        </div>
      )}
    </div>
  );
}
