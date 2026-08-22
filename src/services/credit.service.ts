import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { Prisma } from "@prisma/client";

// ---------------------------------------------------------------- TKT-069: AI credits

/** Fixed id of the single-row AiCreditConfig. */
export const AI_CREDIT_CONFIG_ID = "global";

/** Fallback daily allowance when no config row exists yet (matching the schema default). */
export const DEFAULT_DAILY_ALLOWANCE = 20;

/**
 * Cost schedule (owner spec, analysis v09) — every AI spend surface enforces
 * its cost via `deductCredits` using these constants; call sites must never
 * hardcode a number.
 */
export const CREDIT_COSTS = {
  /** Generate a questionnaire from a prompt — flat, regardless of question count. */
  GENERATE_QUESTIONNAIRE: 5,
  /** AI add-question (wired in TKT-062). */
  ADD_QUESTION: 2,
  /** AI edit-question (wired in TKT-062). */
  EDIT_QUESTION: 1,
} as const;

/** Typed error thrown when a deduction would exceed the day's available credits. */
export class InsufficientCreditsError extends AppError {
  constructor(remaining: number) {
    super(
      `AI credits exhausted — remaining ${Math.max(0, remaining)}, resets tomorrow`,
      402,
      "INSUFFICIENT_CREDITS"
    );
    this.name = "InsufficientCreditsError";
  }
}

/**
 * Today's calendar date as YYYY-MM-DD in the SERVER-LOCAL timezone (WIB).
 * The daily boundary is deliberately server-local per analysis v09 §6 —
 * flip to UTC only if the owner asks for a fixed boundary.
 */
export function todayKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Convert a YYYY-MM-DD key to a Date pinned to UTC midnight, so the `@db.Date`
 * column stores exactly that calendar date regardless of server timezone. */
export function dateFromKey(key: string): Date {
  return new Date(`${key}T00:00:00Z`);
}

type Tx = Prisma.TransactionClient;

async function allowanceAndAdjustments(
  tx: Tx,
  userId: string,
  date: Date
): Promise<{ allowance: number; adjustments: number }> {
  const [user, config, adj] = await Promise.all([
    tx.user.findUnique({ where: { id: userId }, select: { aiCreditsPerDay: true } }),
    tx.aiCreditConfig.upsert({
      where: { id: AI_CREDIT_CONFIG_ID },
      create: { id: AI_CREDIT_CONFIG_ID, dailyDefault: DEFAULT_DAILY_ALLOWANCE },
      update: {},
    }),
    tx.aiCreditAdjustment.aggregate({
      where: { userId, date },
      _sum: { delta: true },
    }),
  ]);
  const allowance = user?.aiCreditsPerDay ?? config.dailyDefault;
  const adjustments = adj._sum.delta ?? 0;
  return { allowance, adjustments };
}

/**
 * Credits available today for `userId`:
 * balance = allowance − used(today) + Σ adjustments(today),
 * where allowance = `User.aiCreditsPerDay` ?? `AiCreditConfig.dailyDefault`.
 * Never negative (clamped to 0).
 */
export async function availableCredits(userId: string): Promise<number> {
  const date = dateFromKey(todayKey());
  const [user, config, usage, adj] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { aiCreditsPerDay: true } }),
    db.aiCreditConfig.findUnique({ where: { id: AI_CREDIT_CONFIG_ID } }),
    db.aiCreditUsage.findUnique({ where: { userId_date: { userId, date } } }),
    db.aiCreditAdjustment.aggregate({
      where: { userId, date },
      _sum: { delta: true },
    }),
  ]);
  const allowance = user?.aiCreditsPerDay ?? config?.dailyDefault ?? DEFAULT_DAILY_ALLOWANCE;
  const adjustments = adj._sum.delta ?? 0;
  const used = usage?.used ?? 0;
  return Math.max(0, allowance - used + adjustments);
}

/**
 * Atomically deduct `cost` credits from `userId`'s balance for today.
 *
 * Race-safe: the usage row's `used` counter is bumped with a conditional
 * UPDATE (`used <= allowance + adjustments − cost`) evaluated under the row
 * lock, so two concurrent deductions can never jointly exceed the balance.
 * Throws {@link InsufficientCreditsError} (rolling back the whole
 * transaction) when the balance would go negative.
 *
 * @returns the remaining balance after the deduction.
 */
export async function deductCredits(
  userId: string,
  cost: number,
  _reason: string
): Promise<number> {
  if (!Number.isInteger(cost) || cost <= 0) {
    throw new AppError("Credit cost must be a positive integer", 500, "INVALID_CREDIT_COST");
  }
  const date = dateFromKey(todayKey());
  return db.$transaction(async (tx) => {
    const { allowance, adjustments } = await allowanceAndAdjustments(tx, userId, date);
    const limit = allowance + adjustments;

    const usage = await tx.aiCreditUsage.upsert({
      where: { userId_date: { userId, date } },
      create: { userId, date, used: 0 },
      update: {},
    });

    const updated = await tx.aiCreditUsage.updateMany({
      where: { id: usage.id, used: { lte: limit - cost } },
      data: { used: { increment: cost } },
    });
    if (updated.count === 0) {
      const remaining = limit - usage.used;
      throw new InsufficientCreditsError(remaining);
    }
    return limit - (usage.used + cost);
  });
}

/**
 * Reverse a deduction (e.g. a generation that threw after the LLM call).
 * Floors `used` at 0 and tolerates a missing usage row (no-op) so refunding
 * a failed attempt can never corrupt the balance or throw.
 */
export async function refundCredits(
  userId: string,
  cost: number,
  _reason: string
): Promise<void> {
  if (!Number.isInteger(cost) || cost <= 0) return;
  const date = dateFromKey(todayKey());
  await db.aiCreditUsage.updateMany({
    where: { userId, date, used: { gte: cost } },
    data: { used: { decrement: cost } },
  });
}

// ---------------------------------------------------------------- TKT-070: Admin Credit Management

export interface UserCreditOverview {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  allowance: number;
  isOverride: boolean;
  usedToday: number;
  adjustmentsToday: number;
  balanceToday: number;
}

export interface CreditAdjustmentRecord {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  date: string;
  delta: number;
  reason: string;
  createdBy: string | null;
  createdAt: string;
}

export interface AdminCreditDashboardData {
  globalDailyDefault: number;
  users: UserCreditOverview[];
  recentAdjustments: CreditAdjustmentRecord[];
}

/** Get the current global default daily allowance. */
export async function getGlobalCreditConfig(): Promise<{ dailyDefault: number }> {
  const config = await db.aiCreditConfig.findUnique({
    where: { id: AI_CREDIT_CONFIG_ID },
  });
  return { dailyDefault: config?.dailyDefault ?? DEFAULT_DAILY_ALLOWANCE };
}

/** Set the global default daily allowance (TKT-070). */
export async function setGlobalDailyDefault(
  dailyDefault: number
): Promise<{ dailyDefault: number }> {
  if (!Number.isInteger(dailyDefault) || dailyDefault < 0) {
    throw new AppError("Daily default credits must be a non-negative integer", 400, "INVALID_ALLOWANCE");
  }
  const config = await db.aiCreditConfig.upsert({
    where: { id: AI_CREDIT_CONFIG_ID },
    create: {
      id: AI_CREDIT_CONFIG_ID,
      dailyDefault,
    },
    update: {
      dailyDefault,
    },
  });
  return { dailyDefault: config.dailyDefault };
}

/** Set a user's daily credit allowance override, or null to revert to global default (TKT-070). */
export async function setUserDailyAllowance(
  userId: string,
  allowance: number | null
): Promise<void> {
  if (allowance !== null && (!Number.isInteger(allowance) || allowance < 0)) {
    throw new AppError("User allowance must be a non-negative integer or null", 400, "INVALID_ALLOWANCE");
  }
  await db.user.update({
    where: { id: userId },
    data: { aiCreditsPerDay: allowance },
  });
}

/** Add a dated credit balance adjustment for today with audit trail (TKT-070). */
export async function adjustUserCreditBalance(
  userId: string,
  delta: number,
  reason: string,
  adminUserId?: string
): Promise<{ id: string; delta: number; reason: string }> {
  if (!Number.isInteger(delta) || delta === 0) {
    throw new AppError("Adjustment delta must be a non-zero integer", 400, "INVALID_ADJUSTMENT_DELTA");
  }
  const trimmedReason = reason?.trim();
  if (!trimmedReason) {
    throw new AppError("Adjustment reason is required", 400, "INVALID_ADJUSTMENT_REASON");
  }
  const date = dateFromKey(todayKey());
  const adj = await db.aiCreditAdjustment.create({
    data: {
      userId,
      date,
      delta,
      reason: trimmedReason,
      createdBy: adminUserId ?? null,
    },
  });
  return { id: adj.id, delta: adj.delta, reason: adj.reason };
}

/** Get full admin overview: global config, user credit balances, and recent adjustments (TKT-070). */
export async function getAdminCreditDashboardData(): Promise<AdminCreditDashboardData> {
  const date = dateFromKey(todayKey());
  const [config, users, usages, adjustments, recentAdjustments] = await Promise.all([
    db.aiCreditConfig.findUnique({ where: { id: AI_CREDIT_CONFIG_ID } }),
    db.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        aiCreditsPerDay: true,
      },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    }),
    db.aiCreditUsage.findMany({
      where: { date },
      select: { userId: true, used: true },
    }),
    db.aiCreditAdjustment.groupBy({
      by: ["userId"],
      where: { date },
      _sum: { delta: true },
    }),
    db.aiCreditAdjustment.findMany({
      include: {
        user: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  const globalDailyDefault = config?.dailyDefault ?? DEFAULT_DAILY_ALLOWANCE;
  const usageMap = new Map<string, number>(
    usages.map((u: { userId: string; used: number }) => [u.userId, u.used])
  );
  const adjMap = new Map<string, number>(
    adjustments.map((a: { userId: string; _sum: { delta: number | null } }) => [
      a.userId,
      a._sum.delta ?? 0,
    ])
  );

  const userOverviews: UserCreditOverview[] = users.map(
    (u: {
      id: string;
      name: string;
      email: string;
      role: string;
      isActive: boolean;
      aiCreditsPerDay: number | null;
    }) => {
      const isOverride = u.aiCreditsPerDay !== null;
      const allowance = u.aiCreditsPerDay ?? globalDailyDefault;
      const usedToday = usageMap.get(u.id) ?? 0;
      const adjustmentsToday = adjMap.get(u.id) ?? 0;
      const balanceToday = Math.max(0, allowance - usedToday + adjustmentsToday);

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        isActive: u.isActive,
        allowance,
        isOverride,
        usedToday,
        adjustmentsToday,
        balanceToday,
      };
    }
  );

  const formattedAdjustments: CreditAdjustmentRecord[] = recentAdjustments.map(
    (adj: {
      id: string;
      userId: string;
      user: { name: string; email: string };
      date: Date;
      delta: number;
      reason: string;
      createdBy: string | null;
      createdAt: Date;
    }) => ({
      id: adj.id,
      userId: adj.userId,
      userName: adj.user.name,
      userEmail: adj.user.email,
      date: todayKey(adj.date),
      delta: adj.delta,
      reason: adj.reason,
      createdBy: adj.createdBy,
      createdAt: adj.createdAt.toISOString(),
    })
  );

  return {
    globalDailyDefault,
    users: userOverviews,
    recentAdjustments: formattedAdjustments,
  };
}
