# 06 — Module & Function Dependency Map

## 1. Layering rules (enforced by convention)

```
app (pages/routes) ──▶ lib/actions (server actions) ──▶ services ──▶ Prisma (db)
                    ──▶ services ────────────────────────────────▶ Prisma
services ──▶ domain (pure)     services ──▶ lib (errors, auth)
domain ──▶ (nothing; pure functions only; imports types only)
components ──▶ domain (client copy of rules) + lib (http helpers)
```

- `src/domain/*` imports nothing except types — zero I/O, unit-testable.
- `src/services/*` are the only Prisma users (one deliberate exception:
  `src/app/api/questionnaires/route.ts`).
- Server actions are the only place that calls `revalidatePath`/`redirect`.

## 2. Service layer — exported functions

### questionnaire.service.ts (builder)
- `createQuestionnaire`, `updateQuestionnaire`, `setQuestionnaireStatus`,
  `listQuestionnaires`, `getQuestionnaireWithQuestions` (deep tree)
- `addQuestion`, `updateQuestionSettings`, `updateQuestionMasterVersion`,
  `updateQuestionOptionSet`, `removeQuestion`, `reorderQuestions`
- `duplicateQuestionnaire`
- Blocks: `createBlock`, `updateBlock`, `deleteBlock`, `reorderBlocks`,
  `setQuestionBlock`, `listBlocks`
- Internal: `validateQuestionnaireRule` (calls domain validation + cycle
  detection), `remapVisibilityRule`/`remapAggregateConfig`, `uniqueSlug`

### response.service.ts (respondent lifecycle)
- `createResponse` (blank draft / single-response return existing)
- `createResponseWithState` (TKT-001 lazy create + atomic state)
- `getResponseForToken`, `listResponses`, `getResponseDetail`
- `saveResponse` (buildSavePlan → writePlan; deletes+recreates answers)
- `getQuestionnaireConfig` (public form config; options resolution)
- Internal: `buildSavePlan` (visibility + required + aggregate + progress),
  `writePlan` (tx), `buildMeta`, `buildFlatAnswers`, `buildGroupRows`,
  `isQuestionAnswered`, `resolveAggregate`, `valueToColumns`

### response-admin.service.ts (TKT-017)
- `deleteResponse` (detach invitation + delete)
- `mailblastRespondent` (find-or-create invite + send; no Response rows)

### master-data.service.ts
- Masters: `createQuestionMaster`, `updateQuestionMaster` (new version),
  `deleteQuestionMaster`, `listQuestionMasters`, `getQuestionMasterHistory`,
  `listAllMasterVersions`
- Option sets: `createOptionSet`, `updateOptionSet` (new version, familyId),
  `deleteOptionSet`, `listOptionSets`, `getOptionSetHistory`,
  `listAllOptionSetVersions`
- Internal: `tryEmbed` (best-effort embedding), `validateMasterFields`

### option-proxy.service.ts
- `getOptionSetOptions(id, { fresh })` — STATIC or EXTERNAL_API + 60s cache
- `fetchExternalOptions` (fetch + timeout + itemsPath + key mapping)
- `clearOptionCache` (tests)

### user.service.ts
- `createUser`, `listUsers`, `getUserById`, `updateUser`, `setUserActive`,
  `resetPassword`, `authenticate`, `validatePassword`

### report.service.ts
- `getQuestionnaireReport(id)` → totals, daily, per-question stats
- `getExportPayload(slug)` → wide + long export table
- Internal: `loadResponses`, `flattenQuestions`, `buildQuestionStats`,
  `collectAnswerValues`, `toExportResponses`, `buildExportAnswers`

### excel.service.ts
- `buildWorkbookBuffer(payload)` — ExcelJS wide + long sheets

### invitation.service.ts (TKT-001)
- `generateInvitations(questionnaireId, emails)` — dedupe/validate, Invitation
  rows only
- `getInvitationByToken`, `markInvitationClicked`,
  `linkInvitationToResponse`
- `sendInvitations(questionnaireId, transport?)` — generate + mail + sentAt
- Internal: `normalizeEmail`, `generateToken`, `parseSampleEmails`

### mail.service.ts
- `sendMail(msg, transport?)` — never throws, returns `{ delivered }`
- `consoleTransport` (only transport today — F-001)
- `buildInvitationMail` (unescaped HTML — F-010)

### rate-limit.service.ts (TKT-003)
- `assertLoginAllowed(email, ip)` — 5/15min window
- `recordLoginFailure`, `recordLoginSuccess`

### access-control.service.ts (TKT-017)
- `assertCanManageQuestionnaire(session, questionnaireId)` — ADMIN any /
  OPERATOR own-or-null / anonymous 401

### rag.service.ts
- `generateQuestionnaireFromPrompt(input, deps)` — hybrid retrieval +
  metadata generation + persistence
- Internal: `retrieveTopMasters` (trigram raw SQL), `retrieveHybrid` (trigram
  + optional vector), `uniqueSlug`, `clampInt`, `clampNum`

### rag-provider.ts
- `createRagProvider()` → LlmRagProvider (OpenAI-compatible) or
  DeterministicRagProvider
- `DeterministicRagProvider.generateMeta` (extractive fallback)

### embedding.provider.ts / embedding.service.ts
- `createEmbedder()` — null when unconfigured
- `embeddingTextForMaster`, `writeMasterEmbedding` (raw SQL),
  `ensureMasterEmbedding`, `backfillEmbeddings`

## 3. Domain layer (pure)

| Module | Functions |
|---|---|
| `rules/visibility.ts` | `evaluateVisibility`, `isRuleSatisfied`, `evaluateSet` |
| `rules/aggregate.ts` | `computeAggregate`, `sumValues`, `sumSourceAcrossRows` |
| `rules/progress.ts` | `calculateProgress` (0 required → 100) |
| `rules/validation.ts` | `validateVisibilityRule`, `detectVisibilityCycles`, `RULE_OPERATORS`, `NUMERIC_OPERATORS` |
| `answers.ts` | `extractAnswerValue`, `isAnswerEmpty`, `serializeDateValue` |
| `options.ts` | `resolveItemsPath`, `mapOptionItem`, `getPath`, `mapOptionItemWithKeys` |
| `rag/intents.ts` | `extractIntents`, `mergeMatches`, `isLowConfidence`, `generateTitle`, `slugify` |
| `rag/hybrid.ts` | `cosineToScore`, `hybridScore`, `mergeHybridMatches` |
| `reporting/stats.ts` | `computeCompletionStats`, `dailyResponseCounts`, `buildChoiceDistribution`, `computeNumericStats` |
| `reporting/export.ts` | `buildExportTable` (wide + long) |
| `types.ts` | shared types (RuleOperator, VisibilityRule, AggregateConfig, AnswerValue) |

## 4. Lib layer

| Module | Contents |
|---|---|
| `lib/db.ts` | PrismaClient singleton (`db`) |
| `lib/errors.ts` | AppError hierarchy + `toAppError` |
| `lib/http.ts` | `jsonOk`, `jsonError`, `getSession`, `isValidRespondentToken` |
| `lib/auth/session.ts` | `signSession`, `verifySession`, SESSION_COOKIE (jose HS256, 7d) |
| `lib/auth/rbac.ts` | Permission types, `PERMISSIONS`, `hasPermission`, `requireAuth`, `requirePermission` |
| `lib/schemas.ts` | Zod: `saveResponseSchema`, `answerInputSchema`, `groupInputSchema`, `visibilityRuleSchema`, `aggregateConfigSchema` |
| `lib/actions/*` | server actions (dashboard.ts, auth.ts, responses.ts) |
| `lib/cn.ts` | className helper |

## 5. UI component map

| Component | Used by | Purpose |
|---|---|---|
| `forms/FormRenderer.tsx` | `/f/[slug]` | Public form: config fetch, invite flow, rules evaluation, repeatable rows, aggregates, save draft/complete |
| `dashboard/Editor.tsx` | edit page | Builder: question list, reorder (drag), required/rule/aggregate/repeatable toggles, blocks panel, sampleEmails + links UI |
| `dashboard/RuleSetsEditor.tsx` | Editor | Multi-set visibility rule editor (TKT-006) |
| `dashboard/GenerateForm.tsx` | `/dashboard/generate` | RAG prompt form |
| `dashboard/NewQuestionnaireForm.tsx` | `/dashboard/new` | Create form |
| `dashboard/DuplicateQuestionnaireButton.tsx` | dashboard | Duplicate action |
| `dashboard/ResponseEditForm.tsx` | edit response page | Prefilled admin edit (TKT-017) |
| `admin/MastersPanel.tsx` | `/admin/question-masters` | Master CRUD + type-dependent disabled fields (TKT-011/016) |
| `admin/OptionSetsPanel.tsx` | `/admin/option-sets` | Option set CRUD incl. external API keys + Test (TKT-010/011/016) |
| `admin/UsersPanel.tsx` | `/admin/users` | User CRUD + reset password |
| `SearchableSelect.tsx`, `ui.tsx`, `toast.tsx` | shared | UI primitives |

## 6. Dependency graph (services → services/domain)

```
questionnaire.service ──▶ domain/rules/validation, domain/types
response.service ──▶ domain/rules/{visibility,aggregate,progress},
                     domain/answers, domain/types,
                     questionnaire.service (getQuestionnaireWithQuestions)
response-admin.service ──▶ invitation.service, mail.service
master-data.service ──▶ embedding.service (tryEmbed)
report.service ──▶ questionnaire.service, domain/answers,
                   domain/reporting/{stats,export}
excel.service ──▶ report.service (types only)
option-proxy.service ──▶ domain/options
invitation.service ──▶ mail.service, lib/errors, lib/db
rag.service ──▶ domain/rag/{intents,hybrid}, rag-provider,
                embedding.provider, lib/db
rate-limit.service ──▶ lib/db
access-control.service ──▶ lib/auth/rbac, lib/db
user.service ──▶ bcryptjs, lib/db
lib/actions/* ──▶ services/*, lib/auth/{rbac,session}, lib/errors, lib/http
```

## 7. Test map

| Test file | Covers |
|---|---|
| `unit/visibility.test.ts` | rule operators, ALL/ANY, legacy + multi-set |
| `unit/aggregate.test.ts` | SUM flat + repeatable rows |
| `unit/progress.test.ts` | progress math incl. 0-required → 100 |
| `unit/answers.test.ts` | per-type value extraction/emptiness |
| `unit/options.test.ts` | itemsPath, getPath, mapOptionItemWithKeys |
| `unit/rule-validation.test.ts` | validation engine + cycles |
| `unit/session.test.ts` | JWT sign/verify/tamper/expiry |
| `unit/rbac.test.ts` | permission matrix |
| `unit/rag.test.ts`, `rag-provider.test.ts`, `embedding-provider.test.ts`, `hybrid.test.ts` | RAG intents, hybrid scoring, provider fallback |
| `unit/reporting-*.test.ts` | stats + export builders |
| `unit/mail.service.test.ts` | sendMail transport behavior |
| `integration/*.test.ts` | user, master-data, questionnaire, response, report, option-proxy, invitation, rate-limit, access-control, response-admin, rag (real Postgres) |
