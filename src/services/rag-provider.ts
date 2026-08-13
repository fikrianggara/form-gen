import { generateTitle } from "@/domain/rag/intents";
import type { RagMatch } from "@/domain/rag/intents";

/**
 * RAG generator providers: given the user prompt + the retrieved candidates,
 * produce the questionnaire metadata (title + description).
 *
 * - DeterministicRagProvider: offline, no API key required. Title comes from
 *   the prompt (or the best match), description is the prompt itself.
 * - LlmRagProvider: OpenAI-compatible chat completions when LLM_API_KEY /
 *   LLM_BASE_URL / LLM_MODEL are configured. The service falls back to the
 *   deterministic provider if the call fails.
 */

export interface CandidateMaster {
  id: string;
  code: string;
  title: string;
  description: string | null;
  questionType: string;
  requiredDefault: boolean;
}

export interface GeneratedMeta {
  title: string;
  description: string;
}

export interface RagGeneratorProvider {
  generateMeta(input: {
    prompt: string;
    matches: RagMatch[];
    candidates: CandidateMaster[];
  }): Promise<GeneratedMeta>;
}

// ------------------------------------------------------------ deterministic

export class DeterministicRagProvider implements RagGeneratorProvider {
  async generateMeta(input: {
    prompt: string;
    matches: RagMatch[];
    candidates: CandidateMaster[];
  }): Promise<GeneratedMeta> {
    return {
      title: generateTitle(input.prompt, input.matches),
      description: input.prompt.trim().slice(0, 500),
    };
  }
}

// -------------------------------------------------------------------- LLM

export function buildLlmPrompt(input: {
  prompt: string;
  matches: RagMatch[];
  candidates: CandidateMaster[];
}): string {
  const bank = input.candidates
    .map((c) => `- ${c.code} (${c.questionType}): ${c.title}${c.description ? ` — ${c.description}` : ""}`)
    .join("\n");
  return [
    "You are a questionnaire designer. Based on the user's request, propose a",
    "questionnaire title and description. Use the retrieved question bank to",
    "inform your naming, but do not invent questions.",
    "",
    `User request: "${input.prompt}"`,
    "",
    "Retrieved question bank:",
    bank,
    "",
    'Respond with ONLY a JSON object: {"title": "...", "description": "..."}',
  ].join("\n");
}

/** Parse a model response into { title, description }, tolerating JSON fences and prose. */
export function parseLlmMeta(text: string): GeneratedMeta | null {
  const trimmed = text.trim();
  const candidates: string[] = [trimmed];
  // Slice from the first { to the last } — survives fences and explanatory prose.
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) {
    candidates.push(trimmed.slice(start, end + 1));
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === "object") {
        const rec = parsed as Record<string, unknown>;
        if (
          typeof rec.title === "string" &&
          rec.title.trim() &&
          typeof rec.description === "string"
        ) {
          return { title: rec.title.trim(), description: rec.description.trim() };
        }
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

export class LlmRagProvider implements RagGeneratorProvider {
  async generateMeta(input: {
    prompt: string;
    matches: RagMatch[];
    candidates: CandidateMaster[];
  }): Promise<GeneratedMeta> {
    const apiKey = process.env.LLM_API_KEY;
    const baseUrl = (process.env.LLM_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
    const model = process.env.LLM_MODEL ?? "gpt-4o-mini";
    if (!apiKey) {
      throw new Error("LLM_API_KEY is not configured");
    }

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        messages: [
          { role: "system", content: "You generate concise questionnaire metadata as JSON." },
          { role: "user", content: buildLlmPrompt(input) },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error(`LLM provider responded with HTTP ${res.status}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("LLM provider returned no content");
    const meta = parseLlmMeta(content);
    if (!meta) throw new Error("LLM provider returned unparseable metadata");
    return meta;
  }
}

/** Pick the provider: LLM when configured, deterministic otherwise. */
export function createRagProvider(): RagGeneratorProvider {
  if (process.env.LLM_API_KEY) {
    return new LlmRagProvider();
  }
  return new DeterministicRagProvider();
}
