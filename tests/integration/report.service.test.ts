import { describe, it, expect, beforeEach } from "vitest";
import { truncateAll } from "./helpers";
import { db } from "@/lib/db";
import {
  createResponse,
  saveResponse,
} from "@/services/response.service";
import { createQuestionnaire, addQuestion, setQuestionnaireStatus } from "@/services/questionnaire.service";
import { createQuestionMaster, createOptionSet } from "@/services/master-data.service";
import { getQuestionnaireReport, getExportPayload } from "@/services/report.service";
import { buildWorkbookBuffer } from "@/services/excel.service";

beforeEach(async () => {
  await truncateAll();
});

const TOKEN_A = "token-aaa-111";
const TOKEN_B = "token-bbb-222";
const TOKEN_C = "token-ccc-333";

interface Survey {
  q: { id: string };
  qName: { id: string };
  qMood: { id: string };
  qAge: { id: string };
  qRating: { id: string };
  qTopics: { id: string };
  qItems: { id: string };
  qAmount: { id: string };
  qTotal: { id: string };
}

async function buildSurvey(): Promise<Survey> {
  const q = await createQuestionnaire({ title: "Report Survey", slug: "report-survey" });

  const moodSet = await createOptionSet({
    name: "Mood",
    source: "STATIC",
    options: [
      { label: "Happy", value: "happy" },
      { label: "Sad", value: "sad" },
    ],
  });
  const topicSet = await createOptionSet({
    name: "Topics",
    source: "STATIC",
    options: [
      { label: "Tech", value: "tech" },
      { label: "Biz", value: "biz" },
    ],
  });

  const mName = await createQuestionMaster({ code: "rs_name", title: "Name", questionType: "TEXT", requiredDefault: true });
  const mMood = await createQuestionMaster({ code: "rs_mood", title: "Mood", questionType: "RADIO", optionSetId: moodSet.id, requiredDefault: true });
  const mAge = await createQuestionMaster({ code: "rs_age", title: "Age", questionType: "NUMBER" });
  const mRating = await createQuestionMaster({ code: "rs_rating", title: "Satisfaction", questionType: "RATING", ratingMax: 5 });
  const mTopics = await createQuestionMaster({ code: "rs_topics", title: "Topics", questionType: "CHECKBOX", optionSetId: topicSet.id });
  const mItems = await createQuestionMaster({ code: "rs_items", title: "Items", questionType: "TEXT" });
  const mAmount = await createQuestionMaster({ code: "rs_amount", title: "Amount", questionType: "NUMBER", requiredDefault: true });
  const mTotal = await createQuestionMaster({ code: "rs_total", title: "Total", questionType: "NUMBER" });

  const qName = await addQuestion({ questionnaireId: q.id, questionMasterId: mName.id, required: true });
  const qMood = await addQuestion({ questionnaireId: q.id, questionMasterId: mMood.id, required: true });
  const qAge = await addQuestion({ questionnaireId: q.id, questionMasterId: mAge.id });
  const qRating = await addQuestion({ questionnaireId: q.id, questionMasterId: mRating.id });
  const qTopics = await addQuestion({ questionnaireId: q.id, questionMasterId: mTopics.id });
  const qItems = await addQuestion({ questionnaireId: q.id, questionMasterId: mItems.id, isRepeatable: true });
  const qAmount = await addQuestion({ questionnaireId: q.id, questionMasterId: mAmount.id, parentId: qItems.id, required: true });
  const qTotal = await addQuestion({
    questionnaireId: q.id,
    questionMasterId: mTotal.id,
    isAggregate: true,
    aggregateConfig: { type: "SUM", sourceQuestionId: qAmount.id },
  });

  return { q, qName, qMood, qAge, qRating, qTopics, qItems, qAmount, qTotal };
}

async function seedResponses(s: Survey) {
  await setQuestionnaireStatus(s.q.id, "ACTIVE");

  // Alice: complete with everything + two expense rows
  const a = await createResponse(s.q.id, TOKEN_A, "Alice");
  await saveResponse(a.id, {
    status: "COMPLETED",
    answers: [
      { questionId: s.qName.id, value: "Alice" },
      { questionId: s.qMood.id, value: "happy" },
      { questionId: s.qAge.id, value: 25 },
      { questionId: s.qRating.id, value: 5 },
      { questionId: s.qTopics.id, value: ["tech", "biz"] },
    ],
    groups: [
      {
        parentQuestionId: s.qItems.id,
        rows: [
          [{ questionId: s.qAmount.id, value: 100 }],
          [{ questionId: s.qAmount.id, value: 250 }],
        ],
      },
    ],
  });

  // Bob: complete without age
  const b = await createResponse(s.q.id, TOKEN_B, "Bob");
  await saveResponse(b.id, {
    status: "COMPLETED",
    answers: [
      { questionId: s.qName.id, value: "Bob" },
      { questionId: s.qMood.id, value: "sad" },
      { questionId: s.qRating.id, value: 4 },
      { questionId: s.qTopics.id, value: ["tech"] },
    ],
    groups: [{ parentQuestionId: s.qItems.id, rows: [[{ questionId: s.qAmount.id, value: 50 }]] }],
  });

  // Carol: draft, name only
  const c = await createResponse(s.q.id, TOKEN_C, "Carol");
  await saveResponse(c.id, { answers: [{ questionId: s.qName.id, value: "Carol" }] });
}

describe("report service — questionnaire report", () => {
  it("computes overall completion stats", async () => {
    const s = await buildSurvey();
    await seedResponses(s);
    const report = await getQuestionnaireReport(s.q.id);
    expect(report?.totals).toEqual({
      total: 3,
      completed: 2,
      drafts: 1,
      completionRate: 67,
      averageProgress: 78, // (100 + 100 + 33) / 3 = 77.7 -> 78
    });
  });

  it("computes per-question answered counts and rates", async () => {
    const s = await buildSurvey();
    await seedResponses(s);
    const report = await getQuestionnaireReport(s.q.id);
    const byCode = new Map(report?.questions.map((x) => [x.code, x]) ?? []);

    expect(byCode.get("rs_name")).toMatchObject({ answeredCount: 3, responseRate: 100, rowCount: 3 });
    expect(byCode.get("rs_mood")).toMatchObject({ answeredCount: 2, responseRate: 67 });
    expect(byCode.get("rs_age")).toMatchObject({ answeredCount: 1, responseRate: 33 });
    expect(byCode.get("rs_rating")).toMatchObject({ answeredCount: 2, responseRate: 67 });
    // Repeatable children count responses with >=1 row and total rows
    expect(byCode.get("rs_amount")).toMatchObject({ answeredCount: 2, responseRate: 67, rowCount: 3 });
    // Aggregate sum is a computed answer per completed response
    expect(byCode.get("rs_total")).toMatchObject({ answeredCount: 2, responseRate: 67 });
  });

  it("builds choice distributions and numeric stats", async () => {
    const s = await buildSurvey();
    await seedResponses(s);
    const report = await getQuestionnaireReport(s.q.id);
    const byCode = new Map(report?.questions.map((x) => [x.code, x]) ?? []);

    const mood = byCode.get("rs_mood");
    expect(mood?.distribution).toEqual([
      { value: "happy", label: "Happy", count: 1, percent: 50 },
      { value: "sad", label: "Sad", count: 1, percent: 50 },
    ]);

    const topics = byCode.get("rs_topics");
    expect(topics?.distribution).toEqual([
      { value: "tech", label: "Tech", count: 2, percent: 66.7 },
      { value: "biz", label: "Biz", count: 1, percent: 33.3 },
    ]);

    const rating = byCode.get("rs_rating");
    expect(rating?.numeric).toEqual({ count: 2, min: 4, max: 5, avg: 4.5, sum: 9 });
    expect(rating?.distribution).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "5", count: 1, percent: 50 }),
        expect.objectContaining({ value: "4", count: 1, percent: 50 }),
      ])
    );

    const total = byCode.get("rs_total");
    expect(total?.numeric).toEqual({ count: 2, min: 50, max: 350, avg: 200, sum: 400 });
  });

  it("skips repeatable headers and includes group titles on children", async () => {
    const s = await buildSurvey();
    await seedResponses(s);
    const report = await getQuestionnaireReport(s.q.id);
    expect(report?.questions.some((x) => x.code === "rs_items")).toBe(false);
    const amount = report?.questions.find((x) => x.code === "rs_amount");
    expect(amount?.groupTitle).toBe("Items");
  });

  it("never lists the same question twice", async () => {
    const s = await buildSurvey();
    await seedResponses(s);
    const report = await getQuestionnaireReport(s.q.id);
    const ids = report?.questions.map((x) => x.questionId) ?? [];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("returns null for an unknown questionnaire", async () => {
    expect(await getQuestionnaireReport("nope")).toBeNull();
  });
});

describe("report service — export", () => {
  it("builds wide rows with joined group values and lossless long rows", async () => {
    const s = await buildSurvey();
    await seedResponses(s);
    const payload = await getExportPayload("report-survey");
    expect(payload).not.toBeNull();

    // Columns: 6 meta + name/mood/age/rating/topics + "Items → Amount" + Total
    const keys = payload?.columns.map((c) => c.key) ?? [];
    expect(keys).toContain("responseId");
    expect(keys).toContain(s.qName.id);
    expect(keys).toContain(s.qAmount.id);
    expect(payload?.columns.find((c) => c.key === s.qAmount.id)?.label).toBe("Items → Amount");

    const alice = payload?.rows.find((r) => r.responseId !== undefined && r.respondentLabel === "Alice");
    expect(alice).toMatchObject({
      respondentLabel: "Alice",
      status: "COMPLETED",
      progress: 100,
    });
    expect(alice?.[s.qAge.id]).toBe(25);
    expect(alice?.[s.qRating.id]).toBe(5);
    expect(alice?.[s.qTopics.id]).toEqual(["tech", "biz"]);
    expect(alice?.[s.qAmount.id]).toBe("100; 250");
    expect(alice?.[s.qTotal.id]).toBe(350);

    const amountLong = payload?.longRows.filter(
      (r) => r.responseId === alice?.responseId && r.questionKey === s.qAmount.id
    );
    expect(amountLong).toHaveLength(2);
    expect(amountLong?.[0]).toMatchObject({ groupTitle: "Items", rowIndex: 0, value: 100 });
    expect(amountLong?.[1]).toMatchObject({ rowIndex: 1, value: 250 });
  });

  it("returns null for an unknown slug", async () => {
    expect(await getExportPayload("does-not-exist")).toBeNull();
  });

  it("generates a readable xlsx workbook with two sheets", async () => {
    const s = await buildSurvey();
    await seedResponses(s);
    const payload = await getExportPayload("report-survey");
    expect(payload).not.toBeNull();

    const buffer = await buildWorkbookBuffer(payload!);
    expect(buffer.length).toBeGreaterThan(1000);

    // Round-trip through exceljs to verify the workbook is valid.
    const ExcelJS = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(
      buffer as unknown as Parameters<typeof wb.xlsx.load>[0]
    );
    expect(wb.worksheets.map((ws) => ws.name)).toEqual(["Responses", "Answers (long)"]);

    const wide = wb.getWorksheet("Responses")!;
    expect(wide.rowCount).toBe(4); // header + 3 responses
    const header = wide.getRow(1).values as unknown[];
    expect(header).toContain("Respondent");
    expect(header).toContain("Items → Amount");

    const long = wb.getWorksheet("Answers (long)")!;
    expect(long.rowCount).toBeGreaterThan(10);
  });
});
