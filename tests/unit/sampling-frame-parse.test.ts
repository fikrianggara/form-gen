import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { parseSamplingFrameWorkbook } from "@/services/excel.service";

/** Build an in-memory .xlsx buffer from rows (first row = headers). */
async function workbookBuffer(rows: unknown[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Frame");
  for (const row of rows) ws.addRow(row);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

describe("parseSamplingFrameWorkbook", () => {
  it("parses valid rows and derives EMAIL/PHONE contact types", async () => {
    const buf = await workbookBuffer([
      ["organization_name", "contact"],
      ["BPS Pusat", "ops@bps.go.id"],
      ["BPS Jakarta", "+62 21 1234 5678"],
    ]);
    const result = await parseSamplingFrameWorkbook(buf);
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      { organizationName: "BPS Pusat", contact: "ops@bps.go.id", contactType: "EMAIL" },
      { organizationName: "BPS Jakarta", contact: "+62 21 1234 5678", contactType: "PHONE" },
    ]);
  });

  it("accepts case/space variations of the fixed headers", async () => {
    const buf = await workbookBuffer([
      ["Organization Name", "Contact"],
      ["BPS", "a@example.com"],
    ]);
    const result = await parseSamplingFrameWorkbook(buf);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].organizationName).toBe("BPS");
  });

  it("reports a hard error when required columns are missing", async () => {
    const buf = await workbookBuffer([
      ["organization_name", "notes"],
      ["BPS", "something"],
    ]);
    const result = await parseSamplingFrameWorkbook(buf);
    expect(result.rows).toEqual([]);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message.toLowerCase()).toContain("contact");
  });

  it("flags invalid contacts as per-row errors and keeps valid rows", async () => {
    const buf = await workbookBuffer([
      ["organization_name", "contact"],
      ["Good", "a@example.com"],
      ["Bad", "not-a-contact"],
    ]);
    const result = await parseSamplingFrameWorkbook(buf);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].organizationName).toBe("Good");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(3);
    expect(result.errors[0].message.toLowerCase()).toContain("contact");
  });

  it("flags rows with an empty organization name", async () => {
    const buf = await workbookBuffer([
      ["organization_name", "contact"],
      ["", "a@example.com"],
    ]);
    const result = await parseSamplingFrameWorkbook(buf);
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message.toLowerCase()).toContain("organization");
  });

  it("skips fully empty rows", async () => {
    const buf = await workbookBuffer([
      ["organization_name", "contact"],
      ["", ""],
      ["BPS", "a@example.com"],
    ]);
    const result = await parseSamplingFrameWorkbook(buf);
    expect(result.rows).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
  });

  it("treats a bare phone number (no plus/spaces) as valid PHONE", async () => {
    const buf = await workbookBuffer([
      ["organization_name", "contact"],
      ["Kantor Desa", "08123456789"],
    ]);
    const result = await parseSamplingFrameWorkbook(buf);
    expect(result.errors).toEqual([]);
    expect(result.rows[0].contactType).toBe("PHONE");
  });

  it("rejects a workbook with no data rows", async () => {
    const buf = await workbookBuffer([["organization_name", "contact"]]);
    const result = await parseSamplingFrameWorkbook(buf);
    expect(result.rows).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
