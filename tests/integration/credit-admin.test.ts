import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { truncateAll } from "./helpers";
import { createUser } from "@/services/user.service";
import {
  availableCredits,
  getGlobalCreditConfig,
  setGlobalDailyDefault,
  setUserDailyAllowance,
  adjustUserCreditBalance,
  getAdminCreditDashboardData,
  todayKey,
  dateFromKey,
  AI_CREDIT_CONFIG_ID,
  DEFAULT_DAILY_ALLOWANCE,
} from "@/services/credit.service";
import { hasPermission } from "@/lib/auth/rbac";
import type { Role } from "@prisma/client";

beforeEach(async () => {
  await truncateAll();
});

const TODAY = () => dateFromKey(todayKey());

async function makeUser(role: Role = "OPERATOR", allowance?: number | null) {
  const user = await createUser({
    email: `user-${Date.now()}-${Math.random()}@example.com`,
    name: "Test User",
    password: "Password123!",
    role,
  });
  if (allowance !== undefined) {
    await db.user.update({
      where: { id: user.id },
      data: { aiCreditsPerDay: allowance },
    });
  }
  return user;
}

describe("admin AI credit management (TKT-070)", () => {
  describe("RBAC permission rules", () => {
    it("restricts MANAGE_AI_CREDITS to ADMIN only", () => {
      expect(hasPermission({ role: "ADMIN" }, "MANAGE_AI_CREDITS")).toBe(true);
      expect(hasPermission({ role: "OPERATOR" }, "MANAGE_AI_CREDITS")).toBe(false);
      expect(hasPermission({ role: "DEV" as Role }, "MANAGE_AI_CREDITS")).toBe(false);
      expect(hasPermission(null, "MANAGE_AI_CREDITS")).toBe(false);
    });
  });

  describe("global daily default management", () => {
    it("returns the default constant when no row exists", async () => {
      const config = await getGlobalCreditConfig();
      expect(config.dailyDefault).toBe(DEFAULT_DAILY_ALLOWANCE);
    });

    it("updates the global daily default and applies to non-override users immediately", async () => {
      const user = await makeUser("OPERATOR");

      expect(await availableCredits(user.id)).toBe(20);

      const res = await setGlobalDailyDefault(35);
      expect(res.dailyDefault).toBe(35);

      const updatedConfig = await getGlobalCreditConfig();
      expect(updatedConfig.dailyDefault).toBe(35);

      // Non-override user immediately sees 35 credits
      expect(await availableCredits(user.id)).toBe(35);

      // AiCreditConfig row stores updated dailyDefault
      const row = await db.aiCreditConfig.findUnique({
        where: { id: AI_CREDIT_CONFIG_ID },
      });
      expect(row?.dailyDefault).toBe(35);
    });

    it("rejects invalid global daily default values", async () => {
      await expect(setGlobalDailyDefault(-5)).rejects.toThrow(/non-negative/);
      await expect(setGlobalDailyDefault(12.5)).rejects.toThrow(/non-negative/);
    });
  });

  describe("per-user allowance override", () => {
    it("sets a per-user allowance that overrides the global default", async () => {
      await setGlobalDailyDefault(25);
      const user = await makeUser("OPERATOR");

      expect(await availableCredits(user.id)).toBe(25);

      await setUserDailyAllowance(user.id, 50);
      expect(await availableCredits(user.id)).toBe(50);

      const dbUser = await db.user.findUnique({ where: { id: user.id } });
      expect(dbUser?.aiCreditsPerDay).toBe(50);
    });

    it("clearing user allowance (null) reverts the user back to the global default", async () => {
      await setGlobalDailyDefault(30);
      const user = await makeUser("OPERATOR", 100);

      expect(await availableCredits(user.id)).toBe(100);

      await setUserDailyAllowance(user.id, null);
      expect(await availableCredits(user.id)).toBe(30);

      const dbUser = await db.user.findUnique({ where: { id: user.id } });
      expect(dbUser?.aiCreditsPerDay).toBeNull();
    });

    it("rejects negative user allowance values", async () => {
      const user = await makeUser();
      await expect(setUserDailyAllowance(user.id, -10)).rejects.toThrow(/non-negative/);
    });
  });

  describe("dated balance adjustments (audit trail)", () => {
    it("adds positive and negative adjustments for today with audit trail", async () => {
      const admin = await makeUser("ADMIN");
      const user = await makeUser("OPERATOR"); // 20 default

      const adj1 = await adjustUserCreditBalance(user.id, 10, "VIP quota bonus", admin.id);
      expect(adj1.delta).toBe(10);
      expect(adj1.reason).toBe("VIP quota bonus");

      expect(await availableCredits(user.id)).toBe(30);

      const adj2 = await adjustUserCreditBalance(user.id, -5, "Quota reduction", admin.id);
      expect(adj2.delta).toBe(-5);

      expect(await availableCredits(user.id)).toBe(25);

      const records = await db.aiCreditAdjustment.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "asc" },
      });
      expect(records).toHaveLength(2);
      expect(records[0].createdBy).toBe(admin.id);
      expect(records[0].reason).toBe("VIP quota bonus");
      expect(records[1].createdBy).toBe(admin.id);
      expect(records[1].reason).toBe("Quota reduction");
    });

    it("rejects zero delta or empty reason", async () => {
      const user = await makeUser();
      await expect(adjustUserCreditBalance(user.id, 0, "test")).rejects.toThrow(/non-zero/);
      await expect(adjustUserCreditBalance(user.id, 5, "")).rejects.toThrow(/required/);
      await expect(adjustUserCreditBalance(user.id, 5, "   ")).rejects.toThrow(/required/);
    });
  });

  describe("admin dashboard data aggregation", () => {
    it("aggregates global default, user credit overviews, and recent adjustments", async () => {
      const admin = await makeUser("ADMIN");
      const user1 = await makeUser("OPERATOR"); // default 20
      const user2 = await makeUser("OPERATOR", 15); // override 15

      // Record some usage today for user1
      await db.aiCreditUsage.create({
        data: { userId: user1.id, date: TODAY(), used: 5 },
      });

      // Record an adjustment today for user2
      await adjustUserCreditBalance(user2.id, 10, "Top-up for workshop", admin.id);

      const dashboard = await getAdminCreditDashboardData();

      expect(dashboard.globalDailyDefault).toBe(20);
      expect(dashboard.users.length).toBeGreaterThanOrEqual(3);

      const u1Overview = dashboard.users.find((u) => u.id === user1.id);
      expect(u1Overview).toBeDefined();
      expect(u1Overview?.allowance).toBe(20);
      expect(u1Overview?.isOverride).toBe(false);
      expect(u1Overview?.usedToday).toBe(5);
      expect(u1Overview?.adjustmentsToday).toBe(0);
      expect(u1Overview?.balanceToday).toBe(15);

      const u2Overview = dashboard.users.find((u) => u.id === user2.id);
      expect(u2Overview).toBeDefined();
      expect(u2Overview?.allowance).toBe(15);
      expect(u2Overview?.isOverride).toBe(true);
      expect(u2Overview?.usedToday).toBe(0);
      expect(u2Overview?.adjustmentsToday).toBe(10);
      expect(u2Overview?.balanceToday).toBe(25);

      expect(dashboard.recentAdjustments.length).toBeGreaterThanOrEqual(1);
      const adjRecord = dashboard.recentAdjustments.find((a) => a.userId === user2.id);
      expect(adjRecord).toBeDefined();
      expect(adjRecord?.reason).toBe("Top-up for workshop");
      expect(adjRecord?.delta).toBe(10);
    });
  });
});
