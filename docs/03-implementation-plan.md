# FormGen — Implementation Plan

> **Goal:** Build a Google Forms–style form engine (Next.js + PostgreSQL) with
> question masters, option-set master data (static + external API), a questionnaire
> builder with conditional rules / repeatable groups / aggregate questions, response
> lifecycle with progress, and admin/operator RBAC — clean code, unit + integration
> tests, clean UI.
>
> **Approach:** TDD for the domain engine (rules, aggregates, progress, validation).
> Vertical slices: infra → schema → domain → auth → public flow → dashboard → admin.
> Frequent commits. Every task lists exact files and verification commands.
>
> **Stack:** Next.js 14 (App Router, TS, Tailwind) · Prisma · PostgreSQL 14 (local,
> Homebrew) · Vitest · jose (JWT sessions) · bcryptjs · Zod.

---

## Phase 0 — Infrastructure

### Task 0.1: Scaffold Next.js app
- Scaffold into temp dir, move into `~/projects/form-gen` (preserving `docs/`).
- Run: `npx create-next-app@14 /tmp/fg-scaffold --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-git`, then `rsync -a /tmp/fg-scaffold/ ~/projects/form-gen/` (minus `docs`), `rm -rf /tmp/fg-scaffold`.
- Verify: `cd ~/projects/form-gen && npm run build` succeeds.

### Task 0.2: Install dependencies
- Run: `npm i @prisma/client bcryptjs jose zod` + `npm i -D prisma vitest @vitest/coverage-v8 @types/bcryptjs supertest @types/supertest`.
- Add scripts: `test`, `test:unit`, `test:integration`, `test:all`, `db:migrate`, `db:seed`.

### Task 0.3: Environment + Prisma init
- Write `.env` (`DATABASE_URL=postgresql://localhost:5432/form_gen`) and `.env.test` (`.../form_gen_test`).
- `npx prisma init`; put schema in `prisma/schema.prisma`.

## Phase 1 — Data Model (Task 1.x)

### Task 1.1: Prisma schema
- Create models per technical spec §2 (User, QuestionMaster, OptionSet, Option,
  Questionnaire, QuestionnaireQuestion, Response, AnswerGroup, Answer).
- `npx prisma migrate dev --name init` against `form_gen`.
- Verify: `npx prisma migrate status` clean; `psql form_gen -c '\dt'` shows tables.

### Task 1.2: DB client singleton
- `src/lib/db.ts` — PrismaClient singleton (dev hot-reload safe).
- Test: integration smoke test connects and counts tables.

## Phase 2 — Domain Engine (TDD: RED → GREEN per behavior)

### Task 2.1: Answer value extraction + validation
- `src/domain/answers.ts` — typed extraction per QuestionType from an Answer record;
  Zod schemas for each type.
- Tests `tests/unit/answers.test.ts`: each type accepts/rejects.

### Task 2.2: Visibility rule engine
- `src/domain/rules/visibility.ts` — pure evaluator for all operators + ALL/ANY.
- Tests `tests/unit/visibility.test.ts`: EQ/NEQ/GTE/CONTAINS/ANY_OF/NONE_OF, ALL vs ANY.

### Task 2.3: Aggregate engine
- `src/domain/rules/aggregate.ts` — `sumRows(rows: (number|null)[])` and group-aware
  source resolution (pure).
- Tests `tests/unit/aggregate.test.ts`: empty, single, multi-row, null-skipping.

### Task 2.4: Progress calculation
- `src/domain/rules/progress.ts` — given visible+required questions and answered set,
  return 0–100.
- Tests `tests/unit/progress.test.ts`: 0%, partial, 100%, none-required → 100.

### Task 2.5: Session JWT
- `src/lib/auth/session.ts` — sign/verify with jose (HMAC, env secret).
- Tests `tests/unit/session.test.ts`: round-trip, tamper, expiry.

## Phase 3 — Services (Integration tests, real Postgres `form_gen_test`)

### Task 3.1: User service + RBAC helpers
- `src/services/user.service.ts` (create/update/activate/reset) + `src/lib/auth/rbac.ts`.
- Integration tests: admin manages users; operator blocked by service-level guard.

### Task 3.2: Master data service
- `src/services/master-data.service.ts` — question masters + option sets CRUD.
- Integration tests: create/update/delete masters & sets; operator create-only rule.

### Task 3.3: Questionnaire builder service
- `src/services/questionnaire.service.ts` — create/update questionnaire, add/remove/
  reorder questions, update question settings, publish/close.
- Integration tests: ordering, duplicate master-in-group guard, status transitions.

### Task 3.4: Response service
- `src/services/response.service.ts` — create/resume/save/complete; single-response
  enforcement; computed aggregates persisted; progress persisted; immutability after
  completion.
- Integration tests cover the full draft→complete lifecycle incl. repeatable group
  with aggregate SUM.

### Task 3.5: Option proxy service
- `src/services/option-proxy.service.ts` — static path + external fetch with timeout,
  `itemsPath` JSON pointer, mapping, cache.
- Unit test: JSON pointer + mapping; integration test with a local stub HTTP server
  (`node:http` in test).

## Phase 4 — Public API + Form UI

### Task 4.1: Public API routes
- `GET /api/questionnaires`, `GET /api/questionnaires/[slug]`,
  `GET|POST|PATCH /api/questionnaires/[slug]/responses`,
  `GET /api/option-sets/[id]/options` (+ zod validation, error envelope).
- Integration: submit draft → complete via HTTP (supertest against route handlers).

### Task 4.2: Public UI
- Landing `/`; login `/login`; form fill `/f/[slug]` (client renderer using the API:
  progress bar, conditional visibility, repeatable rows, aggregate display,
  save draft / submit); respondent token cookie via API.

## Phase 5 — Dashboard + Admin UI (Server Actions)

### Task 5.1: Dashboard shell + auth guard
- `/dashboard` layout with nav; middleware protects routes; login/logout actions.

### Task 5.2: Questionnaire list + builder editor
- List, create, settings edit, question list (add-from-master, reorder, required,
  rule editor, aggregate toggle, repeatable toggle), publish/close.

### Task 5.3: Responses views
- List with status/progress, detail view of answers incl. computed values.

### Task 5.4: Admin panels
- `/admin/users` (CRUD, role, activate), `/admin/question-masters`,
  `/admin/option-sets` (incl. external API config + "Test fetch" button).

## Phase 6 — Seed, Polish, Verify

### Task 6.1: Seed
- `prisma/seed.ts`: admin/operator users, demo masters (all 8 types), static option
  set, external-API option set (pointing at a public test endpoint), demo questionnaire
  exercising rules + repeatable group + aggregate, second single-response questionnaire.

### Task 6.2: Full verification
- `npm run test:all` green; `npm run build` green.
- Smoke test: `npm run dev`; curl the public API; submit a completed response via
  curl; verify progress=100, status=COMPLETED, aggregate sum correct in DB.

### Task 6.3: README
- Setup, env vars, seed credentials, scripts, architecture summary, known limitations.

---

## Files likely to change (summary)

- `prisma/schema.prisma`, `prisma/seed.ts`, `prisma/migrations/*`
- `src/lib/{db,auth/session,auth/rbac,http,zod-schemas}.ts`
- `src/domain/{answers.ts,rules/visibility.ts,rules/aggregate.ts,rules/progress.ts}`
- `src/services/{user,master-data,questionnaire,response,option-proxy}.service.ts`
- `src/app/**` (routes, api handlers, server actions), `src/components/**`
- `tests/unit/**`, `tests/integration/**`, `vitest.config.ts`, `.env`, `.env.test`, `README.md`

## Risks & open questions
- External API reachability (mitigated: timeout, cache, graceful degradation).
- Prisma `Json` typing (mitigated: shared Zod schemas).
- Single-response identity is token-based (documented limitation).
