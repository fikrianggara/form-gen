import ExcelJS from "exceljs";
import type { ExportPayload } from "@/services/report.service";

/**
 * Render an export payload as an .xlsx buffer.
 * - Sheet "Responses": wide table, one row per response.
 * - Sheet "Answers (long)": lossless one-row-per-answer table.
 * Array values (checkbox selections) are joined with ", " for spreadsheet cells.
 */
export async function buildWorkbookBuffer(payload: ExportPayload): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "FormGen";
  workbook.created = new Date();

  const wide = workbook.addWorksheet("Responses");
  wide.columns = payload.columns.map((c) => ({
    header: c.label,
    key: c.key,
    width: Math.min(40, Math.max(14, c.label.length + 4)),
  }));
  wide.getRow(1).font = { bold: true };
  for (const row of payload.rows) {
    wide.addRow(normalizeCellValues(row));
  }

  const long = workbook.addWorksheet("Answers (long)");
  const longHeaders: Array<[string, string]> = [
    ["responseId", "Response ID"],
    ["respondentLabel", "Respondent"],
    ["status", "Status"],
    ["progress", "Progress (%)"],
    ["createdAt", "Created At"],
    ["completedAt", "Completed At"],
    ["questionCode", "Question Code"],
    ["questionTitle", "Question Title"],
    ["questionType", "Question Type"],
    ["groupTitle", "Group"],
    ["rowIndex", "Row"],
    ["value", "Value"],
  ];
  long.columns = longHeaders.map(([key, header]) => ({
    header,
    key,
    width: Math.min(40, Math.max(12, header.length + 4)),
  }));
  long.getRow(1).font = { bold: true };
  for (const row of payload.longRows) {
    long.addRow({
      responseId: row.responseId,
      respondentLabel: row.respondentLabel ?? "",
      status: row.status,
      progress: row.progress,
      createdAt: row.createdAt,
      completedAt: row.completedAt ?? "",
      questionCode: row.questionCode,
      questionTitle: row.questionTitle,
      questionType: row.questionType,
      groupTitle: row.groupTitle ?? "",
      rowIndex: row.rowIndex ?? "",
      value: normalizeValue(row.value),
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function normalizeCellValues(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = normalizeValue(value);
  }
  return out;
}

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(String).join(", ");
  return value;
}
