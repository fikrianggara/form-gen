# 05 — Flows

Sequence diagrams for the core flows, derived from the code.

## 1. Anonymous respondent: fill & save

```
Respondent                    Browser/FormRenderer          API/Service                 DB
    │                                │                         │                        │
    │  GET /f/customer-feedback      │                         │                        │
    │───────────────────────────────▶│                         │                        │
    │                                │ GET /api/questionnaires/[slug]                   │
    │                                │────────────────────────▶│                        │
    │                                │                         │ getQuestionnaireConfig │
    │                                │                         │───────────────────────▶│
    │                                │◀──────── config (questions, blocks, rules) ──────│
    │                                │                         │                        │
    │                                │ GET /api/option-sets/[id]/options (per external) │
    │                                │────────────────────────▶│ (proxy fetch upstream) │
    │                                │◀────────── options ─────│                        │
    │                                │                         │                        │
    │  respondent token = getToken() │ (localStorage/cookie)   │                        │
    │  (first visit: POST blank)     │                         │                        │
    │  user fills answers...         │                         │                        │
    │                                │                         │                        │
    │  Save draft / Submit           │ PATCH /responses/[id]    │                        │
    │───────────────────────────────▶│  { token, answers, groups, status }               │
    │                                │────────────────────────▶│ saveResponse           │
    │                                │                         │───────────────────────▶│
    │                                │                         │ buildSavePlan:         │
    │                                │                         │  evaluate visibility   │
    │                                │                         │  validate required     │
    │                                │                         │  compute aggregates    │
    │                                │                         │  compute progress      │
    │                                │                         │ writePlan (tx):        │
    │                                │                         │  delete+recreate       │
    │                                │                         │  answers/groups        │
    │                                │                         │  update status/progress│
    │                                │◀──────── updated response ───────│                │
    │◀──── toast + state update ─────│                         │                        │
```

Key rules verified in code:
- PATCH validates `respondentToken` === response's token (owner-only).
- Questionnaire must be `ACTIVE` (`assertActive`) — DRAFT/CLOSED reject 409.
- `status: COMPLETED` requires all visible required questions answered,
  else 422 `REQUIRED_MISSING`; sets `completedAt`; subsequent saves 409
  `RESPONSE_COMPLETED`.
- Visibility: top-level questions evaluated in order; children inherit
  parent's visibility. Unknown deps treated as unanswered.

## 2. Unique-link invitation flow (TKT-001)

```
Operator                     Dashboard UI                 Invitation/Mail Service      DB
   │  generate+send links       │                              │                       │
   │───────────────────────────▶│ sendInvitationsAction        │                       │
   │                            │─────────────────────────────▶│ sendInvitations       │
   │                            │                              │ generateInvitations   │
   │                            │                              │──────────────────────▶│ Invitation rows
   │                            │                              │ (no Response rows!)   │
   │                            │                              │ sendMail each         │
   │                            │                              │ (console fallback)    │
   │                            │◀───────── links ─────────────│                       │

Respondent              Browser (FormRenderer)           API                        DB
   │  GET /f/slug?invite=<token>                            │                         │
   │──────────────────────────────────────────────────────▶│                         │
   │                              │ GET /api/invitations/[token]                     │
   │                              │────────────────────────▶│ getInvitationByToken   │
   │                              │                         │───────────────────────▶│
   │                              │                         │ markInvitationClicked  │
   │                              │◀──── valid + email ─────│                         │
   │  (respondentToken := invite token; email prefilled)    │                         │
   │  fills form                                             │                         │
   │  Save/Submit (first time)    │ POST /responses          │                         │
   │                              │ { token=invite, answers, status }                 │
   │                              │────────────────────────▶│ createResponseWithState│
   │                              │                         │───────────────────────▶│ Response + answers
   │                              │                         │ linkInvitationToResponse│
   │                              │◀──────── created ───────│                         │
   │  subsequent saves            │ PATCH /responses/[id]    │ (normal save flow)     │
```

Notes: no Response exists until first save (never blank rows). Invitation
tokens currently have no expiry/single-use enforcement (F-003).

## 3. Admin/operator response actions (TKT-017)

```
Operator                    Action layer                 Service                 DB
   │  delete response          │                           │                      │
   │──────────────────────────▶│ deleteResponseAction      │                      │
   │                           │ requirePermission +       │                      │
   │                           │ assertCanManageQuestionnaire                    │
   │                           │──────────────────────────▶│ deleteResponse       │
   │                           │                           │ tx: detach invitation│
   │                           │                           │     delete response  │
   │                           │                           │────────────────────▶│ cascade answers/groups
   │                           │                           │                      │
   │  mailblast respondent      │ mailblastRespondentAction │                      │
   │──────────────────────────▶│ (same gates)              │                      │
   │                           │──────────────────────────▶│ mailblastRespondent  │
   │                           │                           │ find-or-create invite│
   │                           │                           │ sendMail (console)   │
   │                           │                           │────────────────────▶│ sentAt update
   │                           │                           │                      │
   │  edit response             │ updateResponseAction      │                      │
   │──────────────────────────▶│ (same gates)              │                      │
   │                           │──────────────────────────▶│ saveResponse         │
   │                           │                           │ ⚠ 409 if COMPLETED   │
   │                           │                           │ (F-005: blocked)     │
```

## 4. Login (rate-limited)

```
User → /login → loginAction
  → assertLoginAllowed(email, ip)        [LoginAttempt count in window ≥5 → 429 RATE_LIMITED]
  → authenticate(email, password)        [bcrypt compare; isActive check]
  → fail? recordLoginFailure(email, ip)  → "Invalid email or password"
  → ok? recordLoginSuccess(email, ip)    [clears failures]
  → signSession JWT (HS256, 7d) → httpOnly cookie fg_session → redirect /dashboard
```

Middleware (`src/middleware.ts`) then guards `/dashboard*` (session) and
`/admin/*` (session + ADMIN role) — UX only; actions re-check.

## 5. RAG questionnaire generation

```
User → /dashboard/generate → generateQuestionnaireAction
  → generateQuestionnaireFromPrompt(prompt, maxQuestions, threshold)
  1. extractIntents(prompt)                [sentence split, dedupe, cap 12]
  2. queries = intents + whole prompt
     for each: retrieveHybrid(query, k=3)
       - retrieveTopMasters: pg_trgm similarity(title/description) top-K
       - embedder configured? embed query → pgvector cosine <=> top-K
         (embedding failure → trigram-only for that query)
  3. mergeHybridMatches (best per-source score; 0.6·vec + 0.4·tri; dedupe;
     drop < 0.05; cap maxQuestions)
  4. provider = createRagProvider()
       LLM_API_KEY? LlmRagProvider (chat completions JSON {title,description})
       else DeterministicRagProvider (extractive title-casing)
       LLM failure → deterministic fallback
  5. persist: create DRAFT questionnaire (unique slug) + questions with
     aiSuggested=true, aiConfidence=score, aiLowConfidence=score<threshold
  6. return questionnaire + matches
```

## 6. Report & export

```
Operator → /dashboard/questionnaires/[id]/report
  → getQuestionnaireReport(id)
    - getQuestionnaireWithQuestions (tree)
    - loadResponses (answers + groups)
    - computeCompletionStats (total/completed/rate/avg progress)
    - dailyResponseCounts (responses per day)
    - buildQuestionStats (answered rate, numeric min/max/avg/sum,
      choice distributions incl. RATING scale)
  → renders KPIs + chart + per-question tables

Export:
  → GET /api/questionnaires/[slug]/export  (session required)
    - getExportPayload: buildExportTable (wide columns + lossless long rows)
    - ?format=xlsx → buildWorkbookBuffer (ExcelJS; sheets "Responses" wide +
      "Answers (long)"); checkbox arrays joined with ", "
    - default → JSON payload
```

## 7. Master versioning (question master / option set)

```
Admin saves an edit
  → updateQuestionMaster / updateOptionSet
  → fieldsUnchanged? no-op (no version bump)
  → else tx: flip isLatest=false on current version
            create new version (version+1, isLatest=true)
            option sets: stable familyId keeps identity across renames
  → tryEmbed(new master) best-effort (embedding for RAG)
```
Questionnaires keep the exact version they reference; delete is blocked while
in use (`MASTER_IN_USE` / `OPTION_SET_IN_USE`).

## 8. Duplicate questionnaire

```
Operator → duplicateQuestionnaireAction → duplicateQuestionnaire(id)
  tx:
  - create copy (title "(copy)", unique slug, DRAFT)
  - copy blocks (placeholder entry rules)
  - copy top-level + children questions (order/settings/AI flags/optionSetId)
  - second pass: remap visibilityRule + aggregateConfig + block entryRule
    through the idMap (rules may reference questions created later)
```
