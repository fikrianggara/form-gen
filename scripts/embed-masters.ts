/**
 * Backfill embeddings for latest question masters using the configured
 * embedding provider. Run: npm run db:embed  (add --force to re-embed all).
 */
import { readFileSync } from "node:fs";
import { backfillEmbeddings } from "../src/services/embedding.service";
import { db } from "../src/lib/db";

// Load .env (tsx does not auto-load it; Prisma Client does for DATABASE_URL only).
// Providers read process.env at call time, so loading before main() is enough.
const envText = readFileSync(".env", "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z_]+)="?(.*?)"?\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
}

async function main() {
  const force = process.argv.includes("--force");
  if (!process.env.LLM_EMBEDDING_API_KEY && !process.env.LLM_EMBEDDING_KEY) {
    console.log("No embedding provider configured (LLM_EMBEDDING_API_KEY). Nothing to do.");
    return;
  }
  const result = await backfillEmbeddings({ force });
  console.log(
    `Embeddings backfill: ${result.embedded} embedded, ${result.skipped} skipped ` +
      `(of ${result.total} latest masters)${force ? " [--force]" : ""}`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
