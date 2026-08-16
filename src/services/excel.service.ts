import ExcelJS from "exceljs";
import type { ExportPayload } from "@/services/report.service";

// ---------------------------------------------------------------- sampling frame

export interface SamplingFrameRow {
  organizationName: string;
  contact: string;
  contactType: "EMAIL" | "PHONE";
}

export interface SamplingFrameParseError {
  /** 1-based Excel row number; 0 means a structural problem (headers). */
  row: number;
  message: string;
}

export interface SamplingFrameParseResult {
  rows: SamplingFrameRow[];
  errors: SamplingFrameParseError[];
}

const FRAME_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isPlausiblePhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return /^\+?[\d\s\-().]+$/.test(value) && digits.length >= 7;
}

/**
 * Parse a sampling-frame workbook (TKT-012). Fixed column format:
 * `organization_name` + `contact` (email OR phone). Header matching is
 * case/whitespace tolerant. Valid rows are returned; invalid rows are
 * reported per-row and excluded.
 */
export async function parseSamplingFrameWorkbook(
  buffer: Uint8Array
): Promise<SamplingFrameParseResult> {
  const wb = new ExcelJS.Workbook();
  // exceljs bundles an older @types/node where Buffer is non-generic; cast to
  // the exact parameter type to bridge the Buffer<ArrayBufferLike> mismatch.
  type LoadArg = Parameters<typeof wb.xlsx.load>[0];
  await wb.xlsx.load(buffer as unknown as LoadArg);
  const ws = wb.worksheets[0];
  if (!ws) {
    return { rows: [], errors: [{ row: 0, message: "Workbook has no worksheets" }] };
  }

  // Locate the header row (first non-empty row, within the first 5 rows).
  let headerRow = 0;
  let orgCol = -1;
  let contactCol = -1;
  for (let r = 1; r <= Math.min(ws.rowCount, 5); r++) {
    const values = (ws.getRow(r).values as unknown[])
      .slice(1)
      .map((v) => String(v ?? "").trim().toLowerCase());
    if (values.every((v) => v === "")) continue;
    orgCol = values.findIndex((v) => v.includes("organization"));
    contactCol = values.findIndex(
      (v) => v.includes("contact") || v.includes("email") || v.includes("phone")
    );
    headerRow = r;
    break;
  }

  if (orgCol === -1 || contactCol === -1) {
    return {
      rows: [],
      errors: [
        {
          row: 0,
          message: `Missing required columns; expected "organization_name" and "contact"`,
        },
      ],
    };
  }

  const rows: SamplingFrameRow[] = [];
  const errors: SamplingFrameParseError[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const values = (ws.getRow(r).values as unknown[]).slice(1);
    const org = String(values[orgCol] ?? "").trim();
    const contact = String(values[contactCol] ?? "").trim();
    if (!org && !contact) continue; // skip fully empty rows
    if (!org) {
      errors.push({ row: r, message: `Row ${r}: organization name is empty` });
      continue;
    }
    if (!contact) {
      errors.push({ row: r, message: `Row ${r}: contact is empty` });
      continue;
    }
    if (FRAME_EMAIL_RE.test(contact)) {
      rows.push({ organizationName: org, contact, contactType: "EMAIL" });
    } else if (isPlausiblePhone(contact)) {
      rows.push({ organizationName: org, contact, contactType: "PHONE" });
    } else {
      errors.push({
        row: r,
        message: `Row ${r}: contact "${contact}" is not a valid email or phone`,
      });
    }
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push({ row: headerRow, message: "No data rows found below the header" });
  }

  return { rows, errors };
}

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
