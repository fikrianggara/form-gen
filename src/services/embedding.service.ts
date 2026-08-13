import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { createEmbedder, type Embedder } from "@/services/embedding.provider";

/** The text that gets embedded for a question master (title + description). */
export function embeddingTextForMaster(m: {
  title: string;
  description: string | null;
}): string {
  return [m.title, m.description ?? ""].filter(Boolean).join(". ");
}

/** Persist an embedding for one master version (raw SQL: Prisma cannot write `vector`). */
export async function writeMasterEmbedding(
  masterId: string,
  vector: number[]
): Promise<void> {
  const literal = `[${vector.join(",")}]`;
  await db.$executeRaw(Prisma.sql`
    UPDATE "QuestionMaster" SET embedding = ${literal}::vector WHERE id = ${masterId}
  `);
}

/** Best-effort: embed one master when an embedder is available. */
export async function ensureMasterEmbedding(
  masterId: string,
  opts: { embedder?: Embedder | null } = {}
): Promise<boolean> {
  const embedder = opts.embedder ?? createEmbedder();
  if (!embedder) return false;
  const master = await db.questionMaster.findUnique({
    where: { id: masterId },
    select: { title: true, description: true },
  });
  if (!master) return false;
  const [vector] = await embedder.embedTexts([embeddingTextForMaster(master)]);
  await writeMasterEmbedding(masterId, vector);
  return true;
}

/**
 * Backfill embeddings for latest masters. Default: only masters without an
 * embedding; pass `force: true` to re-embed everything (e.g. after changing
 * the model or dimension).
 */
export async function backfillEmbeddings(
  opts: { force?: boolean; embedder?: Embedder | null } = {}
): Promise<{ total: number; embedded: number; skipped: number }> {
  const embedder = opts.embedder ?? createEmbedder();
  if (!embedder) {
    return { total: 0, embedded: 0, skipped: 0 };
  }
  const rows = await db.$queryRaw<Array<{ id: string; title: string; description: string | null }>>(
    Prisma.sql`
      SELECT id, title, description FROM "QuestionMaster"
      WHERE "isLatest" = true
      ${opts.force ? Prisma.empty : Prisma.sql`AND embedding IS NULL`}
    `
  );
  let embedded = 0;
  const CHUNK = 20;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const vectors = await embedder.embedTexts(chunk.map((r) => embeddingTextForMaster(r)));
    for (let j = 0; j < chunk.length; j++) {
      await writeMasterEmbedding(chunk[j]!.id, vectors[j]!);
      embedded++;
    }
  }
  return { total: rows.length, embedded, skipped: rows.length - embedded };
}
