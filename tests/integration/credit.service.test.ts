import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { truncateAll } from "./helpers";
import { createUser } from "@/services/user.service";
import {
  availableCredits,
  deductCredits,
  refundCredits,
  CREDIT_COSTS,
  InsufficientCreditsError,
  todayKey,
  dateFromKey,
} from "@/services/credit.service";

beforeEach(async () => {
  await truncateAll();
});

const TODAY = () => dateFromKey(todayKey());

async function makeUser(allowance?: number | null): Promise<{ id: string }> {
  const user = await createUser({
    email: "credit@example.com",
    name: "Credit User",
    password: "Secret123!",
    role: "OPERATOR",
  });
  if (allowance !== undefined) {
    await db.user.update({ where: { id: user.id }, data: { aiCreditsPerDay: allowance } });
  }
  return user;
}

describe("credit service (TKT-069)", () => {
  it("starts at the default daily allowance of 20", async () => {
    const user = await makeUser();
    expect(await availableCredits(user.id)).toBe(20);
  });

  it("honors the global config default when set", async () => {
    const user = await makeUser();
    await db.aiCreditConfig.upsert({
      where: { id: "global" },
      create: { id: "global", dailyDefault: 30 },
      update: { dailyDefault: 30 },
    });
    expect(await availableCredits(user.id)).toBe(30);
  });

  it("honors a per-user allowance override over the global default", async () => {
    const user = await makeUser(5);
    await db.aiCreditConfig.upsert({
      where: { id: "global" },
      create: { id: "global", dailyDefault: 20 },
      update: { dailyDefault: 20 },
    });
    expect(await availableCredits(user.id)).toBe(5);
  });

  it("deducts exactly the questionnaire cost (5) and reports the remaining balance", async () => {
    const user = await makeUser();
    const remaining = await deductCredits(
      user.id,
      CREDIT_COSTS.GENERATE_QUESTIONNAIRE,
      "test: generate"
    );
    expect(remaining).toBe(15);
    expect(await availableCredits(user.id)).toBe(15);
    const usage = await db.aiCreditUsage.findUnique({
      where: { userId_date: { userId: user.id, date: TODAY() } },
    });
    expect(usage?.used).toBe(5);
  });

  it("blocks an over-balance deduction and leaves the balance untouched", async () => {
    const user = await makeUser(3);
    await expect(
      deductCredits(user.id, CREDIT_COSTS.GENERATE_QUESTIONNAIRE, "test: over balance")
    ).rejects.toBeInstanceOf(InsufficientCreditsError);
    await expect(
      deductCredits(user.id, CREDIT_COSTS.GENERATE_QUESTIONNAIRE, "test: over balance")
    ).rejects.toThrow(/AI credits exhausted/);
    expect(await availableCredits(user.id)).toBe(3);
  });

  it("refunds a deduction back to the full balance", async () => {
    const user = await makeUser();
    await deductCredits(user.id, CREDIT_COSTS.GENERATE_QUESTIONNAIRE, "test: deduct");
    await refundCredits(user.id, CREDIT_COSTS.GENERATE_QUESTIONNAIRE, "test: refund");
    expect(await availableCredits(user.id)).toBe(20);
  });

  it("never refunds below zero usage", async () => {
    const user = await makeUser();
    await refundCredits(user.id, CREDIT_COSTS.GENERATE_QUESTIONNAIRE, "test: refund with no usage");
    expect(await availableCredits(user.id)).toBe(20);
  });

  it("only counts TODAY's usage — past days do not reduce the balance (inherent daily reset)", async () => {
    const user = await makeUser();
    // A past day where the user burned the entire allowance must not matter today.
    await db.aiCreditUsage.create({
      data: { userId: user.id, date: dateFromKey("2000-01-01"), used: 1000 },
    });
    await deductCredits(user.id, CREDIT_COSTS.GENERATE_QUESTIONNAIRE, "test: today");
    expect(await availableCredits(user.id)).toBe(15);
  });

  it("applies dated adjustments on top of the allowance", async () => {
    const user = await makeUser();
    // A past-day adjustment must NOT affect today's balance.
    await db.aiCreditAdjustment.create({
      data: { userId: user.id, date: dateFromKey("2000-01-01"), delta: 10, reason: "test: past top-up", createdBy: "admin" },
    });
    expect(await availableCredits(user.id)).toBe(20);
    // Today's adjustment adds 10 to today's balance.
    await db.aiCreditAdjustment.create({
      data: { userId: user.id, date: TODAY(), delta: 10, reason: "test: top-up", createdBy: "admin" },
    });
    expect(await availableCredits(user.id)).toBe(30);
  });

  it("adjustments let a deduction exceed the raw allowance", async () => {
    const user = await makeUser(5);
    await db.aiCreditAdjustment.create({
      data: { userId: user.id, date: TODAY(), delta: 10, reason: "test: top-up", createdBy: "admin" },
    });
    await deductCredits(user.id, CREDIT_COSTS.GENERATE_QUESTIONNAIRE, "test: with top-up");
    expect(await availableCredits(user.id)).toBe(10);
  });

  it("is race-safe — concurrent deductions can never jointly exceed the balance", async () => {
    const user = await makeUser();
    // Spend 15 of 20: exactly 5 available. Two concurrent 5-credit deductions
    // must yield exactly ONE success — the second sees used=20 > limit−5.
    await deductCredits(user.id, 15, "test: pre-spend");
    const [a, b] = await Promise.allSettled([
      deductCredits(user.id, CREDIT_COSTS.GENERATE_QUESTIONNAIRE, "test: race A"),
      deductCredits(user.id, CREDIT_COSTS.GENERATE_QUESTIONNAIRE, "test: race B"),
    ]);
    const succeeded = [a, b].filter((r) => r.status === "fulfilled").length;
    const blocked = [a, b].filter(
      (r) => r.status === "rejected" && r.reason instanceof InsufficientCreditsError
    ).length;
    expect(succeeded).toBe(1);
    expect(blocked).toBe(1);
    expect(await availableCredits(user.id)).toBe(0);
  });
});
