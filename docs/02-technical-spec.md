# FormGen — Technical Specification

> Version: 1.0
> Stack: Next.js 14 (App Router, TypeScript, Tailwind) · PostgreSQL 14 · Prisma ORM · Vitest

## 1. Architecture

```
┌────────────────────────────────────────────────────────┐
│  Next.js App Router                                     │
│  ├─ Public pages (landing, /f/[slug], /login)           │
│  ├─ Dashboard pages (builder, responses, admin)         │
│  ├─ Route Handlers (public JSON API for the form)       │
│  └─ Server Actions (dashboard mutations)                │
├────────────────────────────────────────────────────────┤
│  Domain layer (pure, unit-testable)                     │
│  ├─ rules/visibility.ts      conditional engine         │
│  ├─ rules/aggregate.ts       computed sums              │
│  ├─ rules/progress.ts        progress calculation       │
│  └─ validation/answers.ts    server-side answer checks  │
├────────────────────────────────────────────────────────┤
│  Service layer (Prisma, integration-tested)             │
│  ├─ services/questionnaire.service.ts                   │
│  ├─ services/response.service.ts                        │
│  ├─ services/master-data.service.ts                     │
│  ├─ services/option-proxy.service.ts (external API)     │
│  └─ services/user.service.ts                            │
├────────────────────────────────────────────────────────┤
│  Data layer: Prisma → PostgreSQL 14                     │
└────────────────────────────────────────────────────────┘
```

Principles:
- **Domain purity**: rule/progress/aggregate functions are pure `(state) => result`
  with no I/O — trivially unit-testable and shared by client + server validation.
- **Services own all Prisma access**; pages/routes never touch Prisma directly.
- **Server re-validates everything**; client rule evaluation is UX sugar only.

## 2. Data Model (Prisma)

```prisma
enum Role { ADMIN OPERATOR }
enum QuestionType { TEXT TEXTAREA NUMBER DATE RADIO CHECKBOX SELECT RATING }
enum OptionSource { STATIC EXTERNAL_API }
enum QuestionnaireStatus { DRAFT ACTIVE CLOSED }
enum ResponseStatus { DRAFT COMPLETED }

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  name         String
  passwordHash String
  role         Role     @default(OPERATOR)
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model QuestionMaster {
  id              String       @id @default(cuid())
  code            String
  version         Int          @default(1)
  isLatest        Boolean      @default(true)
  title           String
  description     String?
  questionType    QuestionType
  requiredDefault Boolean      @default(false)
  placeholder     String?
  minValue        Int?
  maxValue        Int?
  maxLength       Int?
  ratingMax       Int?         // default 5
  optionSetId     String?
  optionSet       OptionSet?   @relation(fields: [optionSetId], references: [id])
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  @@unique([code, version])
  @@index([code, isLatest])
}

model OptionSet {
  id           String        @id @default(cuid())
  name         String
  version      Int           @default(1)
  isLatest     Boolean       @default(true)
  source       OptionSource  @default(STATIC)
  apiUrl       String?       // required when EXTERNAL_API
  apiMethod    String?       // GET default
  apiHeaders   Json?         // { "Authorization": "Bearer ..." }
  itemsPath    String?       // JSON pointer e.g. "data.items"
  options      Option[]
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  @@unique([name, version])
  @@index([name, isLatest])
}

model Option {
  id          String     @id @default(cuid())
  optionSetId String
  optionSet   OptionSet  @relation(fields: [optionSetId], references: [id], onDelete: Cascade)
  label       String
  value       String
  order       Int        @default(0)
  @@unique([optionSetId, value])
}

model Questionnaire {
  id                      String               @id @default(cuid())
  title                   String
  description            String?
  slug                    String               @unique
  status                  QuestionnaireStatus  @default(DRAFT)
  acceptMultipleResponses Boolean              @default(true)
  questions               QuestionnaireQuestion[]
  responses               Response[]
  createdAt               DateTime             @default(now())
  updatedAt               DateTime             @updatedAt
}

model QuestionnaireQuestion {
  id              String             @id @default(cuid())
  questionnaireId String
  questionnaire   Questionnaire      @relation(fields: [questionnaireId], references: [id], onDelete: Cascade)
  questionMasterId String
  questionMaster  QuestionMaster     @relation(fields: [questionMasterId], references: [id])
  order           Int
  required        Boolean            @default(false)
  visibilityRule  Json?              // §7 of product spec
  isRepeatable    Boolean            @default(false)
  isAggregate     Boolean            @default(false)
  aggregateConfig Json?              // { type: "SUM", sourceQuestionId }
  parentId        String?
  parent          QuestionnaireQuestion? @relation("RepeatableParent", fields: [parentId], references: [id])
  children        QuestionnaireQuestion[] @relation("RepeatableParent")
  answers         Answer[]
  answerGroups    AnswerGroup[]
  @@unique([questionnaireId, questionMasterId, parentId]) // no dup masters in one group
}

model Response {
  id               String           @id @default(cuid())
  questionnaireId  String
  questionnaire    Questionnaire    @relation(fields: [questionnaireId], references: [id], onDelete: Cascade)
  respondentToken  String           // cookie-held identity
  respondentLabel  String?          // optional name/email
  status           ResponseStatus   @default(DRAFT)
  progress         Int              @default(0)
  completedAt      DateTime?
  answers          Answer[]
  answerGroups     AnswerGroup[]
  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt
  @@index([questionnaireId, respondentToken])
}

model AnswerGroup {
  id                       String                @id @default(cuid())
  responseId               String
  response                 Response              @relation(fields: [responseId], references: [id], onDelete: Cascade)
  parentQuestionId         String                // the repeatable QuestionnaireQuestion
  rowIndex                 Int
  answers                  Answer[]
  createdAt                DateTime              @default(now())
  @@unique([responseId, parentQuestionId, rowIndex])
}

model Answer {
  id                     String          @id @default(cuid())
  responseId             String
  response               Response        @relation(fields: [responseId], references: [id], onDelete: Cascade)
  questionId             String
  question               QuestionnaireQuestion @relation(fields: [questionId], references: [id], onDelete: Cascade)
  answerGroupId          String?
  answerGroup            AnswerGroup?    @relation(fields: [answerGroupId], references: [id], onDelete: Cascade)
  textValue              String?
  numberValue            Float?
  dateValue              DateTime?
  jsonValue              Json?           // checkbox selections / row payloads
  isComputed             Boolean         @default(false)
  createdAt              DateTime        @default(now())
  updatedAt              DateTime        @updatedAt
}
```

Notes:
- `Json` fields hold Prisma `InputJsonValue` — runtime shape documented in §3.
- `respondentToken` is a random UUID set in a cookie on first visit; it is *not*
  authentication — it just anchors draft resume and single-response enforcement.

## 3. Rule / Aggregate / Progress Shapes

### visibilityRule (on QuestionnaireQuestion)
```ts
type VisibilityRule = {
  condition: 'ALL' | 'ANY';
  rules: Array<{
    dependsOnQuestionId: string;      // QuestionnaireQuestion id
    operator: 'EQ'|'NEQ'|'GT'|'GTE'|'LT'|'LTE'|'CONTAINS'|'ANY_OF'|'NONE_OF';
    value: string | number | string[];
  }>;
};
```

### aggregateConfig (on QuestionnaireQuestion)
```ts
type AggregateConfig = { type: 'SUM'; sourceQuestionId: string };
```

### Answer value extraction (per question type)
- TEXT/TEXTAREA → `textValue`
- NUMBER → `numberValue`
- DATE → `dateValue` (ISO date)
- RADIO/SELECT → `textValue` (selected option value)
- CHECKBOX → `jsonValue: string[]`
- RATING → `numberValue` (1..max)
- aggregate → `numberValue` marked `isComputed`

## 4. API Surface

### Public route handlers (JSON)
| Method/Route | Purpose |
|---|---|
| `GET /api/questionnaires` | active questionnaires (title/slug/description) |
| `GET /api/questionnaires/[slug]` | full form config: questions (ordered, rules, options), settings |
| `GET /api/questionnaires/[slug]/responses?token=` | resume existing draft for token |
| `POST /api/questionnaires/[slug]/responses` | create response (or return existing when single-response) |
| `PATCH /api/questionnaires/[slug]/responses/[id]` | save draft / complete (body: answers + `status`) |
| `GET /api/option-sets/[id]/options` | static options or live proxy of external API |

All public endpoints are idempotent, validate with Zod, and re-run the domain
engine server-side before persisting.

### Server Actions (dashboard)
- `createQuestionnaire`, `updateQuestionnaire`, `updateQuestionStatus`
- `addQuestionToQuestionnaire`, `updateQuestionSettings`, `removeQuestion`, `reorderQuestions`
- `createQuestionMaster`, `updateQuestionMaster`, `deleteQuestionMaster`
- `createOptionSet`, `updateOptionSet`, `deleteOptionSet`
- `createUser`, `updateUser`, `setUserActive`, `resetUserPassword`
- `login`, `logout`

## 5. Auth & RBAC

- **Sessions**: signed JWT (HMAC, `jose`) in an `httpOnly` cookie `fg_session`.
  Payload: `{ sub, email, name, role }`, 7-day expiry, `SameSite=Lax`.
- **Passwords**: `bcryptjs` (10 rounds).
- **Middleware**: protects `/dashboard*` and `/admin/*`; `/admin/*` additionally
  requires `role === 'ADMIN'`. Route handlers re-check permissions in a helper
  (`requireRole`) — middleware is UX, services are the enforcement point.
- **Seed**: `admin@formgen.app` (ADMIN) and `operator@formgen.app` (OPERATOR),
  password `ChangeMe123!` (documented; flagged to change in README).

## 6. External Option API Proxy

`GET /api/option-sets/[id]/options`:
1. Load OptionSet.
2. If `STATIC` → return stored options.
3. If `EXTERNAL_API` → server-side `fetch(apiUrl, { method, headers })` with 5s
   timeout; resolve array via `itemsPath` JSON pointer (default: root array);
   map `[{ label, value }]` (objects may use `label`/`value` keys, or `name`/`id`
   fallback); cache in-memory for 60s. On failure → `502` with a stable error
   shape so the client can degrade gracefully (hide select, show notice).

## 7. Validation & Rules Flow (server, on every save)

1. Load questionnaire with questions, masters, option sets.
2. Reject if questionnaire not `ACTIVE` (unless DRAFT response resumed by admin? —
   v1: only ACTIVE accepts new/save; CLOSED blocks new responses).
3. For each visible question (evaluate `visibilityRule` against submitted answers
   in order), validate by type via Zod (required check only counts visible questions).
4. Compute aggregates from valid answers; store as computed answers.
5. Recompute `progress` = round(answered visible-required / visible-required * 100).
6. If `status === 'COMPLETED'`, require 100% of visible required answered;
   set `completedAt`; subsequent saves rejected.
7. Single-response: only the token's own response may be saved.

## 8. AI Generation (RAG)

`src/services/rag.service.ts` + `src/domain/rag/intents.ts` + `src/services/rag-provider.ts`.

Flow (`POST` via server action → `/dashboard/generate`):
1. **Intent extraction** (pure): the prompt is split into sentences; each is a
   retrieval query, plus one broad whole-prompt query.
2. **Retrieval**: `pg_trgm` similarity over the latest `QuestionMaster` rows
   (`GREATEST(similarity(title), similarity(description))`), top-K per intent.
3. **Merge**: dedupe by master keeping the highest score, sort descending, cap
   at `maxQuestions` (default 10), drop scores below 0.05.
4. **Generation**: `RagGeneratorProvider` — `LlmRagProvider` (OpenAI-compatible
   `POST {base}/chat/completions`, JSON `{title, description}` response) when
   `LLM_API_KEY` is set; `DeterministicRagProvider` (extractive title-casing)
   otherwise. LLM failures fall back to deterministic.
5. **Persistence**: creates the questionnaire (DRAFT, unique slug) and attaches
   matches with `aiSuggested`, `aiConfidence` (0–1 similarity), and
   `aiLowConfidence` (`score < threshold`, default 0.3) persisted.
6. **Flagging**: the builder renders an `AI <score>` badge per suggested
   question and an amber `⚠ low confidence` flag for weak matches.

New columns on `QuestionnaireQuestion`: `aiSuggested Boolean`, `aiConfidence Float?`,
`aiLowConfidence Boolean`. Retrieval indexes: GIN trigram indexes on
`QuestionMaster(title)` and `QuestionMaster(description)`; `pg_trgm` extension
installed by migration.

## 9. Testing Strategy

- **Unit (Vitest, no DB)**: visibility rule evaluation (all operators, ALL/ANY),
  aggregate SUM incl. repeatable rows, progress calculation, answer type
  validation, JSON pointer extraction, session sign/verify.
- **Integration (Vitest + real Postgres `form_gen_test`)**: service layer —
  user CRUD + RBAC helpers, questionnaire build (add/reorder/remove questions),
  response lifecycle (draft → complete, resume, single-response blocking,
  computed aggregates persisted, progress persisted).
- **Setup**: `.env.test` with `DATABASE_URL=postgresql://localhost:5432/form_gen_test`;
  a global setup script runs `prisma migrate deploy` (or `db push`) then truncates
  tables between tests via `beforeEach` cleanup. Tests run serially (`--pool=forks`,
  `fileParallelism=false`).
- Commands: `npm run test` (unit), `npm run test:integration`, `npm run test:all`.

## 9. Project Layout

```
form-gen/
├─ docs/                    # this spec set
├─ prisma/
│  ├─ schema.prisma
│  └─ seed.ts
├─ src/
│  ├─ app/                  # routes + server actions + api handlers
│  ├─ components/           # UI (form renderer, builder, admin)
│  ├─ domain/               # pure logic (rules, aggregates, progress, validation)
│  ├─ lib/                  # db, auth, http, zod schemas
│  └─ services/             # prisma-backed services
├─ tests/unit/  tests/integration/
├─ .env / .env.test
└─ vitest.config.ts
```

## 10. Risks & Trade-offs

| Risk | Mitigation |
|---|---|
| External API flaky/unreachable | 5s timeout, 60s cache, graceful client degradation, 502 error shape |
| Circular visibility rules | Builder prevents rule on question depending on itself; engine evaluates in order and treats unknown deps as invisible |
| Repeatable groups + aggregates complexity | Pure functions + dedicated unit tests for row-sum |
| Single-response abuse (token reset) | Token cookie + optional respondentLabel; documented limitation |
| Prisma Json typing drift | Shared Zod schemas in `src/lib/schemas` are the single source of truth for JSON shapes |
