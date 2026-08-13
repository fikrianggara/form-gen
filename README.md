# FormGen — Form Engine

A Google Forms–style questionnaire engine built with **Next.js 14 (App Router) +
PostgreSQL + Prisma**. Question bank master data, option sets (static or
external API), a questionnaire builder with conditional rules, repeatable
groups and computed (aggregate) questions, and a full response lifecycle with
draft/completed status and progress. RBAC: admin vs operator.

## Features

- **Question masters** — reusable question definitions: TEXT, TEXTAREA, NUMBER,
  DATE, RADIO, CHECKBOX, SELECT, RATING. **Versioned**: editing creates a new
  immutable version; questionnaires keep the exact version they were built with.
- **Option sets (master data)** — static options, or **external API** sources
  fetched server-side via a proxy route (no CORS, no secret leakage), with a
  JSON-pointer `itemsPath` (e.g. `data.items`) and in-memory caching. Also
  **versioned**, with a "Test" button in admin to fetch the API live
  (`?fresh=1` bypasses the cache).
- **Builder** — ordered questions, required flags, cross-question **conditional
  visibility** (`if A = yes → show B`), **repeatable groups** (add multiple rows
  of child questions), **aggregate questions** (e.g. total = SUM of an expense
  column across all rows), draft/active/closed status, single- or multi-response.
- **AI generation (RAG, hybrid search)** — describe a questionnaire in plain text
  and the system retrieves matching question masters, predicts the
  title/description, creates a draft questionnaire with the best matches, and
  **flags low-confidence suggestions**. Retrieval is **hybrid**: pgvector
  embeddings (cosine) blended with PostgreSQL `pg_trgm` trigram similarity when
  an embedding provider is configured (`LLM_EMBEDDING_API_KEY` + `npm run
  db:embed`), degrading to trigram-only otherwise. Title/description generation
  uses an optional OpenAI-compatible LLM (`LLM_API_KEY`) or a deterministic
  extractive generator.
- **Responses** — DRAFT → COMPLETED lifecycle, immutable after completion,
  server-computed aggregates, stored progress %, resumable drafts, single-response
  enforcement per visitor.
- **RBAC** — ADMIN: users, master data, everything. OPERATOR: build
  questionnaires + create question masters.
- **Clean code** — pure domain engine (rules/aggregates/progress/answers) shared
  by client renderer and server validation; services own all Prisma access;
  server re-validates every save.

## Tech stack

- Next.js 14 (TypeScript, Tailwind CSS, App Router, Route Handlers, Server Actions)
- PostgreSQL 14 · Prisma ORM
- jose (signed session JWTs) · bcryptjs · Zod
- Vitest (unit + integration against a real Postgres test database)

## Getting started

Prerequisites: Node 20+, PostgreSQL running locally.

```bash
cd ~/projects/form-gen
npm install

# 1. Configure environment
cp .env.example .env        # set DATABASE_URL + SESSION_SECRET

# 2. Create the database and apply migrations
createdb form_gen           # or: psql -c 'CREATE DATABASE form_gen;'
npm run db:migrate          # prisma migrate dev

# 3. Seed demo data (users, masters, option sets, two questionnaires)
npm run db:seed

# 4. Run
npm run dev                 # http://localhost:3000
```

### Seed credentials

| Role     | Email                 | Password     |
|----------|-----------------------|--------------|
| Admin    | admin@formgen.app     | ChangeMe123! |
| Operator | operator@formgen.app  | ChangeMe123! |

**Change these passwords immediately** after first login (Admin → Users → Reset password).

### Demo forms

- `/f/customer-feedback` — all 8 question types, conditional rule
  (dependents → dependents count), repeatable expense group, computed total
  (SUM across rows), external-API option set (jsonplaceholder users).
- `/f/registration-form` — single response per visitor.

## Scripts

| Command                    | Purpose                                        |
|----------------------------|------------------------------------------------|
| `npm run dev`              | Dev server                                     |
| `npm run build` / `start`  | Production build / serve                       |
| `npm test`                 | Run all tests (unit + integration)             |
| `npm run test:unit`        | Unit tests only (domain engine, no DB)         |
| `npm run test:integration` | Integration tests (real Postgres `form_gen_test`) |
| `npm run typecheck`        | `tsc --noEmit`                                 |
| `npm run db:migrate`       | Apply migrations (dev)                         |
| `npm run db:seed`          | Seed demo data (idempotent)                    |

## Project layout

```
docs/                     # product spec, technical spec, implementation plan
prisma/schema.prisma      # data model (User, QuestionMaster, OptionSet, Option,
                          #   Questionnaire, QuestionnaireQuestion, Response,
                          #   AnswerGroup, Answer)
prisma/seed.ts            # demo data
src/
  domain/                 # PURE engine — no I/O
    rules/visibility.ts   # conditional rule evaluation (all operators, ALL/ANY)
    rules/aggregate.ts    # SUM aggregates (flat + repeatable rows)
    rules/progress.ts     # completion percentage
    answers.ts            # per-type value extraction / emptiness
    options.ts            # external payload JSON-pointer + item mapping
  services/               # Prisma-backed services (integration tested)
    user.service.ts       # users + auth
    master-data.service.ts# question masters + option sets
    questionnaire.service.ts # builder (order, rules, repeatables, aggregates)
    response.service.ts   # draft/complete lifecycle, aggregates, progress
    option-proxy.service.ts # static + external option resolution
  lib/                    # db singleton, auth (sessions, RBAC), http, zod schemas
  app/                    # routes, API handlers, server actions
    api/questionnaires/...      # public form API
    api/option-sets/[id]/options # option proxy
    f/[slug]                    # public form fill
    dashboard/                  # builder + responses
    admin/                      # users, question masters, option sets
  components/             # form renderer, editor, admin panels, UI kit
tests/
  unit/                   # visibility, aggregates, progress, answers, options,
                          #   sessions, RBAC (no DB)
  integration/            # services against form_gen_test (real Postgres)
```

## How the form engine works

1. **Builder** composes a questionnaire from question masters; each placed
   question gets an order, a required flag, and optionally a visibility rule,
   repeatable flag, or aggregate config.
2. **Public API** serves the config to the form renderer; the client evaluates
   the *same* pure rule engine for instant show/hide UX.
3. **On every save**, the server re-evaluates visibility, validates required
   visible questions, computes aggregate answers (persisted as `isComputed`),
   recalculates progress, and transitions DRAFT → COMPLETED (immutable after).
4. **Single-response** questionnaires return the visitor's existing response
   instead of creating a new one; respondents are tracked by a browser token.

## Testing

- Unit tests cover the domain engine: every rule operator, ALL/ANY semantics,
  SUM aggregates incl. null-skipping, progress math, per-type answer mapping,
  JSON-pointer resolution, session JWT tamper/expiry, RBAC matrix.
- Integration tests run against a dedicated `form_gen_test` database (auto
  migrated in test setup, truncated between tests): user CRUD, master data
  guards (e.g. can't delete an option set in use), builder invariants (no
  duplicate master per group, repeatable-parent rules, reorder validation),
  response lifecycle (draft → complete, resume, single-response blocking,
  conditional skip, computed aggregates persisted), and the option proxy with
  a local stub HTTP server (incl. timeout + unreachable cases).

```bash
npm run test:all
```

## Known limitations

- Respondent identity is a browser token (localStorage) — not authentication;
  single-response enforcement is per browser.
- Aggregate v1 supports `SUM` of one numeric source (extensible in
  `domain/rules/aggregate.ts`).
- The builder rule editor supports a single conditional clause per question
  (the engine supports multiple clauses with ALL/ANY).
- External option APIs are cached in memory for 60s; no persistent cache.

## Security notes

- Sessions: httpOnly, SameSite=Lax, 7-day JWT (HS256) signed with
  `SESSION_SECRET`. Rotate the secret and use a strong value in production.
- Passwords hashed with bcrypt (10 rounds).
- `/admin/*` is enforced at middleware *and* every admin mutation re-checks
  permissions in the service layer.
- External option fetches are server-side only with a 5s timeout; headers
  (e.g. Authorization) never reach the browser.
