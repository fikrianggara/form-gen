import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  DeterministicRagProvider,
  LlmRagProvider,
  buildLlmPrompt,
  parseLlmMeta,
  type CandidateMaster,
} from "@/services/rag-provider";
import type { RagMatch } from "@/domain/rag/intents";

const candidates: CandidateMaster[] = [
  { id: "m1", code: "q_age", title: "Age", description: null, questionType: "NUMBER", requiredDefault: false },
  { id: "m2", code: "q_email", title: "Email address", description: null, questionType: "TEXT", requiredDefault: false },
];

const matches: RagMatch[] = [
  { masterId: "m1", score: 0.8, masterTitle: "Age" },
  { masterId: "m2", score: 0.5, masterTitle: "Email address" },
];

describe("DeterministicRagProvider", () => {
  it("generates a title from the prompt and uses the prompt as description", async () => {
    const provider = new DeterministicRagProvider();
    const meta = await provider.generateMeta({
      prompt: "customer onboarding survey for new users",
      matches,
      candidates,
    });
    expect(meta.title).toBe("Customer Onboarding Survey For New Users");
    expect(meta.description).toContain("customer onboarding survey");
  });

  it("derives novel questions from unmatched intents (TKT-008)", async () => {
    const provider = new DeterministicRagProvider();
    const meta = await provider.generateMeta({
      prompt: "customer onboarding survey",
      matches,
      candidates,
      unmatchedIntents: ["What is your favorite color?", "How many pets do you have?"],
    });
    expect(meta.novelQuestions).toHaveLength(2);
    expect(meta.novelQuestions![0]!.title).toBe("What is your favorite color?");
    expect(meta.novelQuestions![0]!.questionType).toBe("TEXT");
  });

  it("omits novelQuestions when everything matched (TKT-008)", async () => {
    const provider = new DeterministicRagProvider();
    const meta = await provider.generateMeta({
      prompt: "customer onboarding survey",
      matches,
      candidates,
      unmatchedIntents: [],
    });
    expect(meta.novelQuestions).toBeUndefined();
  });
});

describe("buildLlmPrompt", () => {
  it("includes the user prompt and retrieved candidates", () => {
    const prompt = buildLlmPrompt({
      prompt: "Tell me about the user's age",
      matches,
      candidates,
    });
    expect(prompt).toContain("Tell me about the user's age");
    expect(prompt).toContain("q_age");
    expect(prompt).toContain("Email address");
  });

  it("lists unmatched intents as novel hints (TKT-008)", () => {
    const prompt = buildLlmPrompt({
      prompt: "Tell me about the user's age",
      matches,
      candidates,
      unmatchedIntents: ["Favorite color?"],
    });
    expect(prompt).toContain("NOT in the bank");
    expect(prompt).toContain("Favorite color?");
    expect(prompt).toContain("novelQuestions");
  });
});

describe("parseLlmMeta", () => {
  it("parses a plain JSON object", () => {
    expect(parseLlmMeta('{"title":"Age Survey","description":"About age"}')).toEqual({
      title: "Age Survey",
      description: "About age",
    });
  });

  it("parses a fenced JSON block", () => {
    const text = 'Sure!\n```json\n{"title":"Age","description":"desc"}\n```';
    expect(parseLlmMeta(text)).toEqual({ title: "Age", description: "desc" });
  });

  it("parses novelQuestions from the LLM response (TKT-008)", () => {
    const text = JSON.stringify({
      title: "Pets Survey",
      description: "About pets",
      novelQuestions: [
        { title: "How many pets?", questionType: "NUMBER", description: "Count" },
        { title: "Pet type", questionType: "select" },
      ],
    });
    expect(parseLlmMeta(text)).toEqual({
      title: "Pets Survey",
      description: "About pets",
      novelQuestions: [
        { title: "How many pets?", questionType: "NUMBER", description: "Count" },
        { title: "Pet type", questionType: "SELECT", description: null },
      ],
    });
  });

  it("returns null for invalid JSON", () => {
    expect(parseLlmMeta("not json at all")).toBeNull();
  });

  it("returns null when required fields are missing", () => {
    expect(parseLlmMeta('{"title":"Only"}')).toBeNull();
  });
});

describe("LlmRagProvider", () => {
  beforeEach(() => {
    process.env.LLM_API_KEY = "test-key";
    process.env.LLM_BASE_URL = "https://llm.test/v1";
    process.env.LLM_MODEL = "test-model";
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    delete process.env.LLM_API_KEY;
    delete process.env.LLM_BASE_URL;
    delete process.env.LLM_MODEL;
    vi.unstubAllGlobals();
  });

  it("calls the OpenAI-compatible endpoint and returns parsed meta", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({
        choices: [{ message: { content: '{"title":"Age Survey","description":"About age"}' } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } })
    );

    const provider = new LlmRagProvider();
    const meta = await provider.generateMeta({ prompt: "age please", matches, candidates });

    expect(meta).toEqual({ title: "Age Survey", description: "About age" });
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://llm.test/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("test-model");
  });

  it("throws when the endpoint fails (service falls back)", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("boom", { status: 500 }));
    const provider = new LlmRagProvider();
    await expect(
      provider.generateMeta({ prompt: "age", matches, candidates })
    ).rejects.toThrow();
  });
});
