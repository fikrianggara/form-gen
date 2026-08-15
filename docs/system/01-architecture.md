# 01 — Architecture

## 1. Overview

FormGen is a Google Forms–style questionnaire engine. Administrators and
operators manage a reusable question bank and answer-option master data,
compose questionnaires from that bank with conditional logic, repeatable
groups, computed (aggregate) questions, and block grouping, then distribute
questionnaires to respondents via unique per-email invitation links and
collect responses with draft/completed lifecycle, progress tracking, and
report/export.

Respondents need **no account** (TKT-001 re-scope). Identity is a browser-held
token; distribution is link-based.

## 2. Layer diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                          BROWSER (React client)                        │
│  Public: /  /f/[slug]                          Dashboard: /dashboard*  │
│  Admin: /admin/*                              Server Actions (RSC)     │
│  FormRenderer (rules engine client copy)       Editor / Panels         │
└───────────────┬───────────────────────────────┬────────────────────────┘
                │ GET/POST/PATCH JSON            │ "use server" actions
                ▼                               ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     NEXT.JS APP ROUTER (Server)                        │
│                                                                        │
│  ┌─────────────────┐   ┌──────────────────┐   ┌────────────────────┐  │
│  │ Route handlers  │   │ Server actions   │   │ Pages / layouts    │  │
│  │ src/app/api/    │   │ src/lib/actions/ │   │ src/app/           │  │
│  │ (public JSON +  │   │ (dashboard/admin │   │ (RSC: render +     │  │
│  │  export + proxy)│   │  mutations)      │   │  auth gating)      │  │
│  └────────┬────────┘   └────────┬─────────┘   └─────────┬──────────┘  │
│           │                    │                        │             │
│           ▼                    ▼                        ▼             │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │                   SERVICE LAYER (src/services/)                │   │
│  │  questionnaire · response · master-data · option-proxy ·       │   │
│  │  report · user · invitation · mail · rate-limit · access-      │   │
│  │  control · response-admin · rag · embedding · excel            │   │
│  │  (owns ALL Prisma access)                                      │   │
│  └───────┬──────────────────────────┬─────────────────────────────┘   │
│          │                          │                                 │
│          ▼                          ▼                                 │
│  ┌─────────────────┐       ┌─────────────────────────────┐            │
│  │ DOMAIN LAYER    │       │ AUTH (src/lib/auth/)        │            │
│  │ src/domain/     │       │ session.ts (jose JWT)       │            │
│  │ rules/visibility│       │ rbac.ts (permissions)       │            │
│  │ rules/aggregate │       └─────────────────────────────┘            │
│  │ rules/progress  │                                                │
│  │ answers · options│       ┌─────────────────────────────┐            │
│  │ rag/ · reporting/│       │ EXTERNAL (optional)         │            │
│  │ (pure, no I/O)  │       │ LLM / Embedding API         │            │
│  └─────────────────┘       │ Option API (proxy)          │            │
│                            └─────────────────────────────┘            │
└───────────────┬────────────────────────────────────────────────────────┘
                ▼
        ┌──────────────────┐
        │  PostgreSQL 14   │
        │  Prisma ORM      │
        │  pg_trgm + vector│
        └──────────────────┘
```

## 3. Architectural principles (as implemented)

1. **Domain purity** — `src/domain/` contains only pure, deterministic
   functions (visibility evaluation, aggregates, progress, answer mapping,
   option-path mapping, reporting stats, RAG intent/hybrid scoring). No I/O.
   Unit-tested without a database.
2. **Services own all Prisma access** — pages, routes, and actions never touch
   Prisma directly; they call `src/services/*`. The one intentional exception:
   `src/app/api/questionnaires/route.ts` (public landing list) queries Prisma
   directly.
3. **Server re-validates everything** — the client evaluates rules only for UX;
   every save re-runs the domain engine server-side before persisting.
4. **Middleware is UX; services are enforcement** — `src/middleware.ts` guards
   `/dashboard*` and `/admin/*`; every mutation action re-checks
   `requirePermission` and, for questionnaire management, the ownership gate
   `assertCanManageQuestionnaire` (TKT-017).
5. **Versioned master data** — question masters and option sets are
   immutable-per-version; editing creates a new version (`isLatest` flips), so
   questionnaires keep the exact definition they were built with.
6. **Shared engine across client/server** — `FormRenderer` and the server
   validator use the same `evaluateVisibility` / `computeAggregate` code.

## 4. Request flows (summary)

### Public fill (no auth)
```
Browser → GET /f/[slug] (page) → GET /api/questionnaires/[slug] (config)
       → GET /api/option-sets/[id]/options (static or proxied external)
       → POST /api/questionnaires/[slug]/responses (create/lazy create)
       → PATCH /api/questionnaires/[slug]/responses/[id] (save draft/complete)
```

### Unique-link distribution (TKT-001)
```
Operator (dashboard) → sendInvitationsAction → invitation.service
  → generateInvitations (Invitation rows, NO Response rows)
  → mail.service (console fallback today; SMTP transport pending F-001)
Respondent → GET /f/[slug]?invite=<token> → FormRenderer validates via
  GET /api/invitations/[token] → marks clicked → form renders
  → first save → createResponseWithState (lazy Response + current state)
```

### Dashboard mutation
```
Browser form → server action (src/lib/actions/dashboard.ts | responses.ts)
  → requirePermission (rbac) → optional ownership gate → service
  → Prisma → revalidatePath / redirect
```

## 5. Security model

- **Sessions**: HS256-signed JWT (`jose`), 7-day expiry, httpOnly cookie
  `fg_session`, SameSite=Lax, secure in production. Verified in middleware and
  re-verified in actions/routes.
- **Passwords**: bcrypt (10 rounds).
- **RBAC permissions** (`src/lib/auth/rbac.ts`):
  - `MANAGE_USERS` — ADMIN only
  - `MANAGE_MASTER_DATA` — ADMIN only
  - `CREATE_QUESTION_MASTER` — ADMIN + OPERATOR
  - `MANAGE_QUESTIONNAIRES` — ADMIN + OPERATOR
- **Ownership gate** (`access-control.service.ts`): ADMIN may manage any
  questionnaire; OPERATOR only own (`createdBy`) or legacy-null rows.
- **Respondent identity**: opaque browser token (>= 8 chars); PATCH validates
  `respondentToken` matches the response being edited (owner-only).
- **Rate limiting**: dashboard login only, 5 failures / 15 min per (email, ip)
  (`rate-limit.service.ts`). Public response endpoints are NOT yet throttled
  (finding F-004).
- **External calls**: option API fetches are server-side with 5s timeout +
  60s in-memory cache; secrets never reach the browser. RAG LLM/embedding
  calls are server-side, degrade gracefully to deterministic/trigram-only.

## 6. Testing strategy (as implemented)

- **Unit** (`tests/unit`, no DB): visibility (all operators, ALL/ANY, legacy
  + multi-set), aggregates incl. repeatable rows, progress, answer mapping,
  JSON pointer extraction, session sign/verify, RBAC matrix, reporting stats,
  export table builders, mail, RAG intents/hybrid, embedding provider.
- **Integration** (`tests/integration`, real Postgres): service layer — user
  CRUD, master-data guards, questionnaire build/duplicate/reorder, response
  lifecycle, report/export payloads, option proxy with stub HTTP server,
  invitation/mailblast, rate-limit, access-control, response-admin.
- **Setup**: `.env.test` points at a dedicated DB; global setup migrates,
  tests truncate between cases, run serially (`--pool=forks`,
  `fileParallelism=false`).

## 7. Known architectural debt (see analysis register)

- Mail transport is console-only (F-001).
- Invitation links relative, no expiry/single-use (F-002, F-003).
- Public endpoints unthrottled (F-004).
- Completed responses cannot be admin-edited (F-005).
- No audit trail on edits (F-008); `Invitation.responseId` not a relation
  (F-009); dead `requiresAccount` field (F-006).
- No org scoping yet (F-012) — ownership is per-user, not per-org.
