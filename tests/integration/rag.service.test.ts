import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { truncateAll } from "./helpers";
import { generateQuestionnaireFromPrompt } from "@/services/rag.service";
import { createQuestionMaster, createOptionSet } from "@/services/master-data.service";

beforeEach(async () => {
  await truncateAll();
});

async function seedBank() {
  const hobbiesSet = await createOptionSet({
    name: "Hobbies",
    source: "STATIC",
    options: [
      { label: "Reading", value: "reading" },
      { label: "Sports", value: "sports" },
    ],
  });
  const masters = {
    name: await createQuestionMaster({ code: "q_name", title: "Full name", questionType: "TEXT", requiredDefault: true }),
    email: await createQuestionMaster({ code: "q_email", title: "Email address", questionType: "TEXT" }),
    age: await createQuestionMaster({ code: "q_age", title: "Age", questionType: "NUMBER" }),
    satisfaction: await createQuestionMaster({ code: "q_satisfaction", title: "Overall satisfaction", questionType: "RATING", ratingMax: 5 }),
    hobbies: await createQuestionMaster({ code: "q_hobbies", title: "Hobbies", questionType: "CHECKBOX", optionSetId: hobbiesSet.id }),
    comment: await createQuestionMaster({ code: "q_comment", title: "Additional comments", questionType: "TEXTAREA" }),
  };
  return masters;
}

describe("rag.service — generateQuestionnaireFromPrompt", () => {
  it("creates a draft questionnaire with a generated title and description", async () => {
    await seedBank();
    const result = await generateQuestionnaireFromPrompt({
      prompt: "Customer onboarding survey. Ask for their email address and overall satisfaction.",
    });
    expect(result.questionnaire.status).toBe("DRAFT");
    expect(result.questionnaire.title.length).toBeGreaterThan(0);
    expect(result.questionnaire.slug).toMatch(/^[a-z0-9-]+$/);
    expect(result.questionnaire.description).toContain("Customer onboarding");
    const stored = await db.questionnaire.findUnique({ where: { id: result.questionnaire.id } });
    expect(stored?.status).toBe("DRAFT");
  });

  it("retrieves and attaches matching masters as AI-suggested questions", async () => {
    const bank = await seedBank();
    const result = await generateQuestionnaireFromPrompt({
      prompt: "What is your email address? How satisfied are you overall?",
    });
    const attached = await db.questionnaireQuestion.findMany({
      where: { questionnaireId: result.questionnaire.id },
      include: { questionMaster: true },
      orderBy: { order: "asc" },
    });
    expect(attached.length).toBeGreaterThan(0);
    const codes = attached.map((q) => q.questionMaster.code);
    expect(codes).toContain("q_email");
    for (const q of attached) {
      expect(q.aiSuggested).toBe(true);
      expect(typeof q.aiConfidence).toBe("number");
    }
    // Ordered by confidence descending.
    const scores = attached.map((q) => q.aiConfidence ?? 0);
    const sorted = [...scores].sort((a, b) => b - a);
    expect(scores).toEqual(sorted);
  });

  it("flags low-confidence suggestions according to the threshold", async () => {
    await seedBank();
    const low = await generateQuestionnaireFromPrompt({
      prompt: "What is your email address?",
      threshold: 1.0,
    });
    const lowQ = await db.questionnaireQuestion.findMany({
      where: { questionnaireId: low.questionnaire.id },
    });
    expect(lowQ.length).toBeGreaterThan(0);
    expect(lowQ.every((q) => q.aiLowConfidence)).toBe(true);

    const high = await generateQuestionnaireFromPrompt({
      prompt: "What is your email address?",
      threshold: 0,
    });
    const highQ = await db.questionnaireQuestion.findMany({
      where: { questionnaireId: high.questionnaire.id },
    });
    expect(highQ.every((q) => q.aiLowConfidence)).toBe(false);
  });

  it("does not attach the same master twice", async () => {
    await seedBank();
    const result = await generateQuestionnaireFromPrompt({
      prompt: "What is your email address?\nPlease provide your email address.",
    });
    const attached = await db.questionnaireQuestion.findMany({
      where: { questionnaireId: result.questionnaire.id },
      include: { questionMaster: true },
    });
    const codes = attached.map((q) => q.questionMaster.code);
    expect(codes.filter((c) => c === "q_email")).toHaveLength(1);
  });

  it("respects the maxQuestions cap", async () => {
    await seedBank();
    const result = await generateQuestionnaireFromPrompt({
      prompt:
        "Full name. Email address. Age. Overall satisfaction. Hobbies. Additional comments. " +
        "What is your name? What is your email? How old are you?",
      maxQuestions: 3,
    });
    const count = await db.questionnaireQuestion.count({
      where: { questionnaireId: result.questionnaire.id },
    });
    expect(count).toBeLessThanOrEqual(3);
  });

  it("makes the slug unique when the title collides", async () => {
    await seedBank();
    const first = await generateQuestionnaireFromPrompt({ prompt: "Email address collection" });
    const second = await generateQuestionnaireFromPrompt({ prompt: "Email address collection" });
    expect(first.questionnaire.slug).not.toBe(second.questionnaire.slug);
  });

  it("returns per-match confidence in the result payload", async () => {
    await seedBank();
    const result = await generateQuestionnaireFromPrompt({
      prompt: "What is your email address?",
    });
    expect(result.matches.length).toBeGreaterThan(0);
    for (const m of result.matches) {
      expect(typeof m.score).toBe("number");
      expect(typeof m.lowConfidence).toBe("boolean");
      expect(m.masterCode.length).toBeGreaterThan(0);
    }
  });
});
