import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { useCleanDb } from "./helpers";
import {
  purgeExpiredApiLogs,
  DEFAULT_API_LOG_RETENTION_DAYS,
} from "@/services/api-log-retention.service";

useCleanDb();

describe("api-log-retention", () => {
  it("deletes rows older than the retention window, keeps fresh ones", async () => {
    const old = new Date(Date.now() - (DEFAULT_API_LOG_RETENTION_DAYS + 10) * 24 * 60 * 60 * 1000);
    await db.apiRequestLog.create({
      data: { method: "GET", path: "/old", statusCode: 200, durationMs: 1, createdAt: old },
    });
    await db.apiRequestLog.create({
      data: { method: "GET", path: "/fresh", statusCode: 200, durationMs: 1 },
    });

    const { deleted } = await purgeExpiredApiLogs();
    expect(deleted).toBe(1);

    const remaining = await db.apiRequestLog.findMany({ select: { path: true } });
    expect(remaining.map((r) => r.path)).toEqual(["/fresh"]);
  });

  it("is idempotent — second run deletes nothing", async () => {
    const old = new Date(Date.now() - (DEFAULT_API_LOG_RETENTION_DAYS + 10) * 24 * 60 * 60 * 1000);
    await db.apiRequestLog.create({
      data: { method: "GET", path: "/old", statusCode: 200, durationMs: 1, createdAt: old },
    });

    const first = await purgeExpiredApiLogs();
    expect(first.deleted).toBe(1);
    const second = await purgeExpiredApiLogs();
    expect(second.deleted).toBe(0);
  });

  it("returns the effective retention window", async () => {
    const { retainedDays } = await purgeExpiredApiLogs();
    expect(retainedDays).toBe(DEFAULT_API_LOG_RETENTION_DAYS);
  });
});
