/**
 * OpenAI-compatible embedding provider.
 * Reads LLM_EMBEDDING_API_KEY (or LLM_EMBEDDING_KEY), LLM_EMBEDDING_BASE_URL,
 * LLM_EMBEDDING_MODEL and EMBEDDING_DIM (default 1024) from the environment.
 * The `dimensions` parameter is sent explicitly so the output dimension is
 * predictable and stays under pgvector's 2000-dim HNSW limit.
 */

export interface Embedder {
  readonly dimension: number;
  embedTexts(texts: string[]): Promise<number[][]>;
}

export function embeddingConfigured(): boolean {
  return Boolean(process.env.LLM_EMBEDDING_API_KEY || process.env.LLM_EMBEDDING_KEY);
}

export class OpenAiCompatibleEmbedder implements Embedder {
  readonly dimension: number;

  constructor(dimension?: number) {
    this.dimension = dimension ?? Number(process.env.EMBEDDING_DIM ?? 1024);
  }

  async embedTexts(texts: string[]): Promise<number[][]> {
    const apiKey = process.env.LLM_EMBEDDING_API_KEY ?? process.env.LLM_EMBEDDING_KEY;
    if (!apiKey) throw new Error("No embedding API key configured");
    const baseUrl = (process.env.LLM_EMBEDDING_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
    const model = process.env.LLM_EMBEDDING_MODEL ?? "text-embedding-3-small";

    const res = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: texts,
        dimensions: this.dimension,
      }),
    });
    if (!res.ok) {
      throw new Error(`Embedding provider responded with HTTP ${res.status}`);
    }
    const data = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
    const vectors = (data.data ?? []).map((d) => d.embedding ?? []);
    if (vectors.length !== texts.length) {
      throw new Error("Embedding provider returned a mismatched number of vectors");
    }
    for (const v of vectors) {
      if (v.length !== this.dimension) {
        throw new Error(
          `Embedding dimension mismatch: model returned ${v.length}, expected ${this.dimension}`
        );
      }
    }
    return vectors;
  }
}

/** Create an embedder when configured, otherwise null (trigram-only mode). */
export function createEmbedder(): Embedder | null {
  if (!embeddingConfigured()) return null;
  return new OpenAiCompatibleEmbedder();
}
