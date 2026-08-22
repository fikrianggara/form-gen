"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/http";
import { requirePermission } from "@/lib/auth/rbac";
import { toAppError } from "@/lib/errors";
import {
  getAdminCreditDashboardData,
  setGlobalDailyDefault,
  setUserDailyAllowance,
  adjustUserCreditBalance,
  type AdminCreditDashboardData,
} from "@/services/credit.service";

function actionError(err: unknown): { error: string } {
  const appErr = toAppError(err);
  return { error: appErr.message };
}

/**
 * Fetch the admin credit management dashboard data.
 * Requires MANAGE_AI_CREDITS (admin only).
 */
export async function getAdminCreditDashboardAction(): Promise<{
  error?: string;
  data?: AdminCreditDashboardData;
}> {
  try {
    const session = await getSession();
    requirePermission(session, "MANAGE_AI_CREDITS");
    const data = await getAdminCreditDashboardData();
    return { data };
  } catch (err) {
    return actionError(err);
  }
}

/**
 * Set global default daily AI credits.
 * Requires MANAGE_AI_CREDITS (admin only).
 */
export async function setGlobalDailyDefaultAction(input: {
  dailyDefault: number;
}): Promise<{ error?: string; dailyDefault?: number }> {
  try {
    const session = await getSession();
    requirePermission(session, "MANAGE_AI_CREDITS");
    const result = await setGlobalDailyDefault(input.dailyDefault);
    revalidatePath("/admin/ai-credits");
    revalidatePath("/dashboard/generate");
    return { dailyDefault: result.dailyDefault };
  } catch (err) {
    return actionError(err);
  }
}

/**
 * Set a user's daily credit allowance override (null to revert to default).
 * Requires MANAGE_AI_CREDITS (admin only).
 */
export async function setUserDailyAllowanceAction(input: {
  userId: string;
  allowance: number | null;
}): Promise<{ error?: string }> {
  try {
    const session = await getSession();
    requirePermission(session, "MANAGE_AI_CREDITS");
    await setUserDailyAllowance(input.userId, input.allowance);
    revalidatePath("/admin/ai-credits");
    revalidatePath("/dashboard/generate");
    return {};
  } catch (err) {
    return actionError(err);
  }
}

/**
 * Add a dated credit balance adjustment for today with audit trail.
 * Requires MANAGE_AI_CREDITS (admin only).
 */
export async function adjustUserCreditBalanceAction(input: {
  userId: string;
  delta: number;
  reason: string;
}): Promise<{ error?: string; adjustmentId?: string }> {
  try {
    const session = await getSession();
    requirePermission(session, "MANAGE_AI_CREDITS");
    const result = await adjustUserCreditBalance(
      input.userId,
      input.delta,
      input.reason,
      session.sub
    );
    revalidatePath("/admin/ai-credits");
    revalidatePath("/dashboard/generate");
    return { adjustmentId: result.id };
  } catch (err) {
    return actionError(err);
  }
}
