import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import type { SamplingFrameRow } from "@/services/excel.service";

/** List the questionnaire's sampling-frame rows in upload order. */
export async function listSamplingFrame(questionnaireId: string) {
  return db.samplingFrameEntry.findMany({
    where: { questionnaireId },
    orderBy: { rowIndex: "asc" },
  });
}

/**
 * Replace the questionnaire's sampling frame with the given rows
 * (upload semantics: a new upload discards the previous frame).
 */
export async function replaceSamplingFrame(
  questionnaireId: string,
  rows: SamplingFrameRow[]
): Promise<void> {
  const q = await db.questionnaire.findUnique({ where: { id: questionnaireId } });
  if (!q) throw new NotFoundError("Questionnaire not found");

  await db.$transaction([
    db.samplingFrameEntry.deleteMany({ where: { questionnaireId } }),
    db.samplingFrameEntry.createMany({
      data: rows.map((row, index) => ({
        questionnaireId,
        organizationName: row.organizationName,
        contact: row.contact,
        contactType: row.contactType,
        rowIndex: index,
      })),
    }),
  ]);
}

/** Remove a single sampling-frame entry. */
export async function deleteSamplingFrameEntry(entryId: string): Promise<void> {
  const existing = await db.samplingFrameEntry.findUnique({ where: { id: entryId } });
  if (!existing) throw new NotFoundError("Sampling frame entry not found");
  await db.samplingFrameEntry.delete({ where: { id: entryId } });
}

/** Email contacts from the sampling frame (feeds unique-link distribution). */
export async function samplingFrameEmails(questionnaireId: string): Promise<string[]> {
  const entries = await db.samplingFrameEntry.findMany({
    where: { questionnaireId, contactType: "EMAIL" },
    select: { contact: true },
  });
  return entries.map((e) => e.contact);
}
