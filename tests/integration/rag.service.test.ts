import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { truncateAll } from "./helpers";
import { generateQuestionnaireFromPrompt } from "@/services/rag.service";
import { createQuestionMaster, createOptionSet } from "@/services/master-data.service";
import { embeddingTextForMaster, writeMasterEmbedding } from "@/services/embedding.service";
import type { Embedder } from "@/services/embedding.provider";

/**
 * Deterministic fake embedder: word-hash bag-of-words into 1024 dims.
 * Texts sharing words get overlapping vectors -> higher cosine similarity,
 * which lets integration tests exercise the pgvector path without a network.
 */
class FakeEmbedder implements Embedder {
  readonly dimension = 1024;
  async embedTexts(texts: string[]): Promise<number[][]> {
    return texts.map((text) => {
      const v = new Array<number>(1024).fill(0);
      for (const word of text.toLowerCase().split(/\W+/).filter(Boolean)) {
        let h = 7;
        for (const ch of word) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
        v[h % 1024] = (v[h % 1024] ?? 0) + 1;
      }
      return v;
    });
  }
}

beforeEach(async () => {
  await truncateAll();
  // Deterministic: never hit a live LLM or embedding API inside tests. A dev
  // .env with LLM_API_KEY / LLM_EMBEDDING_API_KEY set would make the service
  // call real providers (nondeterministic results, network dependency).
  delete process.env.LLM_API_KEY;
  delete process.env.LLM_BASE_URL;
  delete process.env.LLM_MODEL;
  delete process.env.LLM_EMBEDDING_API_KEY;
  delete process.env.LLM_EMBEDDING_BASE_URL;
  delete process.env.LLM_EMBEDDING_MODEL;
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

describe("rag.service — hybrid vector retrieval", () => {
  it("retrieves semantically-related masters via the vector path", async () => {
    const bank = await seedBank();
    const embedder = new FakeEmbedder();
    for (const m of Object.values(bank)) {
      const [vec] = await embedder.embedTexts([embeddingTextForMaster(m)]);
      await writeMasterEmbedding(m.id, vec);
    }
    // Paraphrased wording: trigram overlaps only weakly, the vector path carries it.
    const result = await generateQuestionnaireFromPrompt(
      { prompt: "Kindly share your email address with us" },
      { embedder }
    );
    const attached = await db.questionnaireQuestion.findMany({
      where: { questionnaireId: result.questionnaire.id },
      include: { questionMaster: true },
    });
    const email = attached.find((q) => q.questionMaster.code === "q_email");
    expect(email).toBeTruthy();
    expect(email?.aiConfidence ?? 0).toBeGreaterThan(0.3);
  });

  it("persists embeddings and reads them back through the vector column", async () => {
    const bank = await seedBank();
    const embedder = new FakeEmbedder();
    const [vec] = await embedder.embedTexts([embeddingTextForMaster(bank.email)]);
    await writeMasterEmbedding(bank.email.id, vec);
    const row = await db.$queryRaw<Array<{ dim: number }>>`
      SELECT vector_dims(embedding) AS dim FROM "QuestionMaster" WHERE id = ${bank.email.id}
    `;
    expect(row[0]?.dim).toBe(1024);
  });

  it("degrades to trigram-only when no embeddings are stored", async () => {
    await seedBank();
    const result = await generateQuestionnaireFromPrompt(
      { prompt: "What is your email address?" },
      { embedder: new FakeEmbedder() }
    );
    const attached = await db.questionnaireQuestion.findMany({
      where: { questionnaireId: result.questionnaire.id },
      include: { questionMaster: true },
    });
    expect(attached.length).toBeGreaterThan(0);
    for (const q of attached) {
      expect(q.aiConfidence ?? 0).toBeGreaterThan(0);
    }
  });

  it("flags prompt intents with no bank match as novel questions (TKT-008)", async () => {
    await seedBank();
    const result = await generateQuestionnaireFromPrompt({
      prompt: "What is your email address? What is your favorite color?",
    });
    expect(result.novel.length).toBeGreaterThan(0);
    expect(result.novel.some((n) => /favorite color/i.test(n.title))).toBe(true);
    // The matched email intent still lands in the questionnaire.
    expect(result.matches.some((m) => /email/i.test(m.masterTitle))).toBe(true);
  });

  it("excludes PENDING masters from retrieval (bank only, TKT-008)", async () => {
    const bank = await seedBank();
    // A PENDING novel master with the same text as a real intent must NOT be retrieved.
    await createQuestionMaster({
      code: "q_favcolor",
      title: "Favorite color",
      questionType: "TEXT",
      status: "PENDING",
    });
    const result = await generateQuestionnaireFromPrompt({
      prompt: "What is your favorite color?",
    });
    expect(result.matches.some((m) => m.masterTitle === "Favorite color")).toBe(false);
    // It IS a novel suggestion (not in the visible bank).
    expect(result.novel.some((n) => /favorite color/i.test(n.title))).toBe(true);
    const attached = await db.questionnaireQuestion.findMany({
      where: { questionnaireId: result.questionnaire.id },
      include: { questionMaster: true },
    });
    expect(attached.some((q) => q.questionMaster.code === "q_favcolor")).toBe(false);
  });

  it("returns no novel questions when every intent matched (TKT-008)", async () => {
    const bank = await seedBank();
    void bank;
    // Both intents have strong lexical matches in the bank ("Email address",
    // "Overall satisfaction") — above the 0.3 novelty threshold.
    const result = await generateQuestionnaireFromPrompt({
      prompt: "What is your email address? How satisfied are you overall?",
    });
    expect(result.novel).toEqual([]);
  });
});
