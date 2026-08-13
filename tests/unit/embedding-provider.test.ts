import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  embeddingConfigured,
  OpenAiCompatibleEmbedder,
  createEmbedder,
} from "@/services/embedding.provider";

const ENV_KEYS = ["LLM_EMBEDDING_API_KEY", "LLM_EMBEDDING_KEY", "LLM_EMBEDDING_BASE_URL", "LLM_EMBEDDING_MODEL", "EMBEDDING_DIM"];

function setEnv(values: Record<string, string>) {
  for (const k of ENV_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(values)) process.env[k] = v;
}

function embedResponse(dim: number, count: number): string {
  const vectors = Array.from({ length: count }, (_, i) =>
    Array.from({ length: dim }, (_, j) => (j === i % dim ? 1 : 0))
  );
  return JSON.stringify({
    object: "list",
    data: vectors.map((embedding, index) => ({ object: "embedding", embedding, index })),
    model: "gemini-embedding-2",
  });
}

describe("embeddingConfigured", () => {
  beforeEach(() => setEnv({}));
  afterEach(() => setEnv({}));

  it("is false when no embedding key is set", () => {
    expect(embeddingConfigured()).toBe(false);
  });

  it("is true when LLM_EMBEDDING_API_KEY is set", () => {
    setEnv({ LLM_EMBEDDING_API_KEY: "k" });
    expect(embeddingConfigured()).toBe(true);
  });

  it("is true when LLM_EMBEDDING_KEY is set (alias)", () => {
    setEnv({ LLM_EMBEDDING_KEY: "k" });
    expect(embeddingConfigured()).toBe(true);
  });
});

describe("OpenAiCompatibleEmbedder", () => {
  beforeEach(() => {
    setEnv({
      LLM_EMBEDDING_API_KEY: "k",
      LLM_EMBEDDING_BASE_URL: "https://embeddings.test/v1",
      LLM_EMBEDDING_MODEL: "gemini-embedding-2",
      EMBEDDING_DIM: "1024",
    });
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    setEnv({});
    vi.unstubAllGlobals();
  });

  it("posts to the embeddings endpoint with model, input and dimensions", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(embedResponse(1024, 2), { status: 200 })
    );
    const embedder = new OpenAiCompatibleEmbedder();
    const vectors = await embedder.embedTexts(["age", "email"]);
    expect(vectors).toHaveLength(2);
    expect(vectors[0]).toHaveLength(1024);

    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://embeddings.test/v1/embeddings");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer k");
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("gemini-embedding-2");
    expect(body.input).toEqual(["age", "email"]);
    expect(body.dimensions).toBe(1024);
  });

  it("throws when the endpoint fails", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("boom", { status: 500 }));
    const embedder = new OpenAiCompatibleEmbedder();
    await expect(embedder.embedTexts(["x"])).rejects.toThrow();
  });

  it("throws when the returned dimension does not match EMBEDDING_DIM", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(embedResponse(768, 1), { status: 200 })
    );
    const embedder = new OpenAiCompatibleEmbedder();
    await expect(embedder.embedTexts(["x"])).rejects.toThrow(/dimension/i);
  });
});

describe("createEmbedder", () => {
  beforeEach(() => setEnv({}));
  afterEach(() => setEnv({}));

  it("returns null when not configured", () => {
    expect(createEmbedder()).toBeNull();
  });

  it("returns an embedder when configured", () => {
    setEnv({ LLM_EMBEDDING_API_KEY: "k" });
    expect(createEmbedder()).toBeInstanceOf(OpenAiCompatibleEmbedder);
  });
});
