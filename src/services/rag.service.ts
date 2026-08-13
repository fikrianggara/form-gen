import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError, ValidationError } from "@/lib/errors";
import {
  extractIntents,
  mergeMatches,
  isLowConfidence,
  generateTitle,
  slugify,
  type RagMatch,
} from "@/domain/rag/intents";
import {
  createRagProvider,
  DeterministicRagProvider,
  type CandidateMaster,
} from "@/services/rag-provider";

const MIN_MATCH_SCORE = 0.05;
const DEFAULT_MAX_QUESTIONS = 10;
const DEFAULT_THRESHOLD = 0.3;
const PER_INTENT_TOP_K = 3;

export interface GenerateQuestionnaireInput {
  prompt: string;
  maxQuestions?: number;
  threshold?: number;
  acceptMultipleResponses?: boolean;
}

export interface GeneratedQuestionnaireResult {
  questionnaire: {
    id: string;
    title: string;
    description: string;
    slug: string;
    status: "DRAFT";
  };
  matches: Array<{
    masterId: string;
    masterCode: string;
    masterTitle: string;
    score: number;
    lowConfidence: boolean;
  }>;
}

interface RetrievalRow {
  id: string;
  code: string;
  title: string;
  questionType: string;
  score: number;
}

/**
 * RAG questionnaire generation:
 * 1. Split the prompt into question intents (plus a broad whole-prompt query).
 * 2. Retrieve matching latest question masters via pg_trgm similarity.
 * 3. Merge + dedupe, keep the best matches, compute confidence.
 * 4. Generate questionnaire metadata (deterministic, or LLM when configured).
 * 5. Create the DRAFT questionnaire and attach matches flagged with their
 *    confidence (low-confidence flags persisted).
 */
export async function generateQuestionnaireFromPrompt(
  input: GenerateQuestionnaireInput
): Promise<GeneratedQuestionnaireResult> {
  const prompt = input.prompt.trim();
  if (!prompt) {
    throw new ValidationError("Prompt must not be empty");
  }
  if (prompt.length > 4000) {
    throw new ValidationError("Prompt is too long (max 4000 characters)");
  }
  const maxQuestions = clampInt(input.maxQuestions ?? DEFAULT_MAX_QUESTIONS, 1, 30);
  const threshold = clampNum(input.threshold ?? DEFAULT_THRESHOLD, 0, 1);

  // ---- retrieval --------------------------------------------------------
  const intents = extractIntents(prompt);
  const queries = intents.length > 0 ? [...intents, prompt] : [prompt];
  const rawMatches: RagMatch[] = [];
  for (const q of queries) {
    const rows = await retrieveTopMasters(q, PER_INTENT_TOP_K);
    for (const row of rows) {
      rawMatches.push({ masterId: row.id, score: row.score, masterTitle: row.title });
    }
  }
  const merged = mergeMatches(rawMatches)
    .filter((m) => m.score >= MIN_MATCH_SCORE)
    .slice(0, maxQuestions);

  // ---- candidate details for the generator -------------------------------
  const candidateIds = merged.map((m) => m.masterId);
  const candidates: CandidateMaster[] =
    candidateIds.length > 0
      ? await db.questionMaster.findMany({
          where: { id: { in: candidateIds }, isLatest: true },
          select: {
            id: true,
            code: true,
            title: true,
            description: true,
            questionType: true,
            requiredDefault: true,
          },
        })
      : [];
  const candidateById = new Map(candidates.map((c) => [c.id, c]));

  // ---- metadata generation (LLM when configured, deterministic otherwise) -
  const provider = createRagProvider();
  let meta: { title: string; description: string };
  try {
    meta = await provider.generateMeta({ prompt, matches: merged, candidates });
  } catch {
    meta = await new DeterministicRagProvider().generateMeta({
      prompt,
      matches: merged,
      candidates,
    });
  }
  const title = meta.title.trim() || generateTitle(prompt, merged);
  const description = (meta.description ?? prompt).trim().slice(0, 500);

  // ---- persistence --------------------------------------------------------
  const slug = await uniqueSlug(slugify(title));
  const questionnaire = await db.$transaction(async (tx) => {
    const created = await tx.questionnaire.create({
      data: {
        title,
        description: description || null,
        slug,
        status: "DRAFT",
        acceptMultipleResponses: input.acceptMultipleResponses ?? true,
      },
    });
    for (let i = 0; i < merged.length; i++) {
      const m = merged[i]!;
      const master = candidateById.get(m.masterId);
      if (!master) continue;
      await tx.questionnaireQuestion.create({
        data: {
          questionnaireId: created.id,
          questionMasterId: m.masterId,
          order: i + 1,
          required: master.requiredDefault,
          aiSuggested: true,
          aiConfidence: m.score,
          aiLowConfidence: isLowConfidence(m.score, threshold),
        },
      });
    }
    return created;
  });

  return {
    questionnaire: {
      id: questionnaire.id,
      title: questionnaire.title,
      description: questionnaire.description ?? "",
      slug: questionnaire.slug,
      status: "DRAFT",
    },
    matches: merged
      .filter((m) => candidateById.has(m.masterId))
      .map((m) => {
        const master = candidateById.get(m.masterId)!;
        return {
          masterId: m.masterId,
          masterCode: master.code,
          masterTitle: master.title,
          score: m.score,
          lowConfidence: isLowConfidence(m.score, threshold),
        };
      }),
  };
}

// ---------------------------------------------------------------- helpers

async function retrieveTopMasters(query: string, k: number): Promise<RetrievalRow[]> {
  const rows = await db.$queryRaw<RetrievalRow[]>(Prisma.sql`
    SELECT
      id,
      code,
      title,
      "questionType" AS "questionType",
      GREATEST(
        similarity(title, ${query}),
        COALESCE(similarity(description, ${query}), 0)
      ) AS score
    FROM "QuestionMaster"
    WHERE "isLatest" = true
    ORDER BY score DESC
    LIMIT ${k}
  `);
  return rows;
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  let i = 2;
  while (await db.questionnaire.findUnique({ where: { slug } })) {
    slug = `${base}-${i}`;
    i++;
  }
  return slug;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function clampNum(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export { AppError };
