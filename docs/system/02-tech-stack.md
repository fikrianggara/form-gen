# 02 — Tech Stack

## 1. Stack summary

| Layer | Technology | Notes |
|-------|------------|-------|
| Framework | Next.js 14 (App Router) | Server components, route handlers, server actions |
| Language | TypeScript 5 | Strict-ish; `tsc --noEmit` in gate |
| UI | React 18 + Tailwind CSS 3 | Client components where interactive |
| ORM | Prisma 6 | PostgreSQL provider; raw SQL for `vector` |
| Database | PostgreSQL 14 | `pg_trgm` + `vector` (pgvector) extensions |
| Auth | jose (JWT HS256) + bcryptjs | httpOnly cookie `fg_session`, 7-day |
| Validation | Zod 4 | Shared schemas in `src/lib/schemas.ts` |
| Export | ExcelJS | `.xlsx` wide + long sheets |
| Tests | Vitest 4 | unit + integration (real Postgres) |
| AI/RAG | OpenAI-compatible APIs | chat completions + embeddings (optional) |

## 2. Dependencies (package.json, verified)

Runtime:
- `@prisma/client` ^6.19.3
- `bcryptjs` ^3.0.3
- `exceljs` ^4.4.0
- `jose` ^6.2.8
- `next` 14.2.35, `react` ^18, `react-dom` ^18
- `zod` ^4.4.3

Dev:
- `prisma` ^6.19.3, `typescript` ^5, `tsx` (scripts)
- `@types/*`, `vitest` ^4.1.10, `@vitest/coverage-v8`
- `supertest` ^7.2.2 (API tests), `eslint` 8 + `eslint-config-next`
- `tailwindcss` ^3.4.1, `postcss` ^8

Note: **no nodemailer / SMTP library** — mail is console-only today
(findings F-001). No CSV/PDF libs (Excel only).

## 3. Environment variables (.env.example)

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | yes | Postgres connection (dev `form_gen`) |
| `SESSION_SECRET` | yes | JWT signing secret (HS256) |
| `OPTION_PROXY_TIMEOUT_MS` | no | External option API timeout, default 5000 |
| `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` | no | RAG title/description LLM |
| `LLM_EMBEDDING_API_KEY` / `LLM_EMBEDDING_BASE_URL` / `LLM_EMBEDDING_MODEL` | no | Semantic retrieval embedder |
| `EMBEDDING_DIM` | no | Embedding dims, default 1024 (must match model + column) |

Test env: `.env.test` sets `DATABASE_URL` to the dedicated integration DB.

## 4. npm scripts

| Script | Purpose |
|--------|---------|
| `dev` | `next dev` (port 3000 by default — see workflow note) |
| `build` / `start` | production build / serve |
| `lint` | `next lint` |
| `test` | `vitest run` (all) |
| `test:unit` | unit only (no DB) |
| `test:integration` | integration (real Postgres) |
| `test:watch` | `vitest` |
| `typecheck` | `tsc --noEmit` |
| `db:migrate` | `prisma migrate dev` (interactive only) |
| `db:deploy` | `prisma migrate deploy` |
| `db:seed` | `tsx prisma/seed.ts` |
| `db:seed-responses` | `tsx scripts/seed-responses.ts` |
| `db:embed` | `tsx scripts/embed-masters.ts` backfill embeddings |

## 5. Databases

| Database | Purpose |
|----------|---------|
| `form_gen` | local dev |
| `form_gen_test` | shared integration suite (merged main) |
| `form_gen_test_tkt###` | per-ticket integration DB (parallel agents) |
| `form_gen_shadow` | Prisma shadow DB for migrations |

## 6. Dev workflow (project-specific)

- Ticket-driven: every feature/bug is a ticket in `tickets/`; code on
  `feat|fix/TKT-###-<slug>` branches; `main` receives ticket-status doc
  commits only; merges via `scripts/merge-tickets.sh`.
- Gate chain before merge: `npx tsc --noEmit && npx vitest run && npx next lint
  && npm run build`.
- Dev servers on `3100 + ticket number` (TKT-001 → 3101). Port 3000 is owned
  by an unrelated app.
- Integration tests against YOUR ticket DB
  (`DATABASE_URL=...form_gen_test_tkt### npx vitest run`), never the shared
  `form_gen_test` while other agents work.
- Prisma quirk: `migrate dev` refuses non-interactive shells — use
  `prisma migrate diff --shadow-database-url ... --script` + `migrate deploy`.

## 7. Prisma migrations (verified)

| Migration | Content |
|-----------|---------|
| `20260814150000_login_attempt` | LoginAttempt table (rate limit) |
| `20260814160000_invitations` | Invitation model + Questionnaire.sampleEmails |
| `20260814160000_option_set_api_keys` | OptionSet.apiLabelKey/apiValueKey |
| `20260815110000_questionnaire_creator` | Questionnaire.createdBy (TKT-017) |

Earlier migrations (before these) cover the core schema, blocks (TKT-007),
and rule/aggregate JSON columns.

## 8. RAG stack details

- Retrieval is hybrid: `pg_trgm` trigram similarity (always) + pgvector cosine
  (when embedder configured). Blend: `0.6·vector + 0.4·trigram`.
- Embeddings stored per QuestionMaster version in `vector(1024)` column; raw
  SQL for writes/reads (Prisma can't handle `vector`).
- Generation: OpenAI-compatible chat completions when `LLM_API_KEY` set, else
  deterministic extractive generator; failures fall back.
- Backfill: `npm run db:embed`; masters auto-embed on create/update
  (best-effort, never blocks).
