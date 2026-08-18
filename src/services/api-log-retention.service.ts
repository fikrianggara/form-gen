import { db } from "@/lib/db";

/** Default retention window for ApiRequestLog (analysis v03 §10.7). */
export const DEFAULT_API_LOG_RETENTION_DAYS = 90;

function retentionDays(): number {
  const raw = process.env.API_LOG_RETENTION_DAYS;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_API_LOG_RETENTION_DAYS;
}

/**
 * Purge ApiRequestLog rows older than the retention window, in bounded
 * batches. Idempotent and safe to run repeatedly (a cron or script).
 * Returns the number of rows deleted.
 */
export async function purgeExpiredApiLogs(
  batchSize = 500
): Promise<{ deleted: number; retainedDays: number }> {
  const days = retentionDays();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  let deleted = 0;
  // Loop in case more than one batch matches.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const rows = await db.apiRequestLog.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
      take: batchSize,
    });
    if (rows.length === 0) break;
    await db.apiRequestLog.deleteMany({
      where: { id: { in: rows.map((r) => r.id) } },
    });
    deleted += rows.length;
  }
  return { deleted, retainedDays: days };
}
