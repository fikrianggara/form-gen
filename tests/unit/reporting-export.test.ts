import { describe, it, expect } from "vitest";
import { buildExportTable, stringifyValue } from "@/domain/reporting/export";
import type { ExportQuestion, ExportResponse } from "@/domain/reporting/export";

const questions: ExportQuestion[] = [
  {
    id: "q_name",
    code: "name",
    title: "Name",
    questionType: "TEXT",
    parentId: null,
    isRepeatable: false,
  },
  {
    id: "q_mood",
    code: "mood",
    title: "Mood",
    questionType: "RADIO",
    parentId: null,
    isRepeatable: false,
  },
  {
    id: "q_items",
    code: "items",
    title: "Items",
    questionType: "TEXT",
    parentId: null,
    isRepeatable: true,
  },
  {
    id: "q_amount",
    code: "amount",
    title: "Amount",
    questionType: "NUMBER",
    parentId: "q_items",
    isRepeatable: false,
  },
];

const response = (over: Partial<ExportResponse> = {}): ExportResponse => ({
  id: "r1",
  respondentLabel: "Alice",
  status: "COMPLETED",
  progress: 100,
  completedAt: "2026-08-13T10:00:00.000Z",
  createdAt: "2026-08-12T09:00:00.000Z",
  answers: [
    { questionId: "q_name", groupParentId: null, rowIndex: null, value: "Alice" },
    { questionId: "q_mood", groupParentId: null, rowIndex: null, value: "happy" },
    // two rows of the repeatable group
    { questionId: "q_amount", groupParentId: "q_items", rowIndex: 0, value: 100 },
    { questionId: "q_amount", groupParentId: "q_items", rowIndex: 1, value: 250 },
  ],
  ...over,
});

describe("buildExportTable", () => {
  it("builds meta + question columns, skipping repeatable headers", () => {
    const { columns } = buildExportTable(questions, [response()]);
    expect(columns.map((c) => c.key)).toEqual([
      "responseId",
      "respondentLabel",
      "status",
      "progress",
      "completedAt",
      "createdAt",
      "q_name",
      "q_mood",
      "q_amount",
    ]);
    const amount = columns.find((c) => c.key === "q_amount");
    expect(amount?.label).toBe("Items → Amount");
  });

  it("produces a wide row with group child values joined", () => {
    const { columns, rows } = buildExportTable(questions, [response()]);
    const row = rows[0];
    expect(row).toMatchObject({
      responseId: "r1",
      respondentLabel: "Alice",
      status: "COMPLETED",
      progress: 100,
      q_name: "Alice",
      q_mood: "happy",
    });
    expect(row.q_amount).toBe("100; 250");
    expect(Object.keys(row)).toHaveLength(columns.length);
  });

  it("keeps single values typed and missing answers null", () => {
    const { rows } = buildExportTable(questions, [
      response({ answers: [] }),
    ]);
    expect(rows[0].q_name).toBeNull();
    expect(rows[0].progress).toBe(100);
  });

  it("emits lossless long rows with group title and row index", () => {
    const { longRows } = buildExportTable(questions, [response()]);
    expect(longRows).toHaveLength(4);
    const amountRows = longRows.filter((r) => r.questionKey === "q_amount");
    expect(amountRows).toHaveLength(2);
    expect(amountRows[0]).toMatchObject({
      responseId: "r1",
      groupTitle: "Items",
      rowIndex: 0,
      value: 100,
    });
    expect(amountRows[1]).toMatchObject({ rowIndex: 1, value: 250 });
    const name = longRows.find((r) => r.questionKey === "q_name");
    expect(name).toMatchObject({
      questionCode: "name",
      questionTitle: "Name",
      questionType: "TEXT",
      groupTitle: null,
      rowIndex: null,
    });
  });

  it("stringifies checkbox arrays for joins", () => {
    const { longRows } = buildExportTable(questions, [
      response({
        answers: [
          {
            questionId: "q_mood",
            groupParentId: null,
            rowIndex: null,
            value: ["a", "b"],
          },
        ],
      }),
    ]);
    expect(longRows[0]?.value).toEqual(["a", "b"]);
    expect(stringifyValue(["a", "b"])).toBe("a, b");
    expect(stringifyValue(42)).toBe("42");
    expect(stringifyValue(null)).toBe("");
  });

  it("disambiguates duplicate question titles with the question code", () => {
    const dup: ExportQuestion[] = [
      {
        id: "q1",
        code: "amt_idr",
        title: "Amount",
        questionType: "NUMBER",
        parentId: null,
        isRepeatable: false,
      },
      {
        id: "q2",
        code: "amt_usd",
        title: "Amount",
        questionType: "NUMBER",
        parentId: null,
        isRepeatable: false,
      },
    ];
    const { columns } = buildExportTable(dup, []);
    const labels = columns.filter((c) => c.kind === "question").map((c) => c.label);
    expect(labels).toEqual(["Amount", "Amount (amt_usd)"]);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
