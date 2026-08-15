# 04 — API Surface

## 1. Public JSON route handlers (`src/app/api/`)

| Method & route | Auth | Purpose |
|---|---|---|
| `GET /api/questionnaires` | none | Active questionnaire list (slug/title/description/question count) |
| `GET /api/questionnaires/[slug]` | none | Full form config for an ACTIVE questionnaire (questions, blocks, rules, options) — 404 if not ACTIVE |
| `GET /api/questionnaires/[slug]/responses?token=` | none | Resume latest response for a respondent token |
| `POST /api/questionnaires/[slug]/responses` | none | Create response. Anonymous: blank draft. Invite flow: `createResponseWithState` (lazy Response + current answers, never blank) |
| `PATCH /api/questionnaires/[slug]/responses/[id]` | none | Save draft / complete. Validates respondentToken matches the response (owner-only); questionnaire must be ACTIVE; completed responses immutable (409) |
| `GET /api/option-sets/[id]/options` | none | Option list: STATIC stored options or server-side proxy of EXTERNAL_API; `?fresh=1` bypasses cache |
| `GET /api/invitations/[token]` | none | Validate invitation token, marks clicked, returns questionnaire + email (no Response created) |
| `GET /api/questionnaires/[slug]/export` | **session required** | All responses as JSON; `?format=xlsx` streams Excel workbook (wide + long sheets) |

All handlers validate with Zod (`src/lib/schemas.ts`), return a stable error
shape `{ error: { code, message } }`, and re-run the domain engine
server-side before persisting.

### Public response body shapes

`GET /api/questionnaires/[slug]` returns:
```
{ questionnaire: {
    id, title, description, slug, status, acceptMultipleResponses,
    blocks: [{ id, title, order, entryRule }],
    questions: [{
      id, order, required, isRepeatable, isAggregate, aggregateConfig,
      visibilityRule, parentId, blockId,
      questionMaster: { id, code, title, description, questionType,
                        placeholder, minValue, maxValue, maxLength, ratingMax },
      options: null | { external: boolean, optionSetId, items: [{label,value}] }
    }]
}}
```
External option sets ship `options.external: true` with empty `items`; the
renderer fetches `/api/option-sets/[id]/options` separately.

### Save body (`saveResponseSchema`)
```
{ token: string (8..128), status?: "DRAFT"|"COMPLETED",
  answers?: [{ questionId, value: string|number|string[]|null }],
  groups?: [{ parentQuestionId, rows: [[ {questionId, value} ]] }],
  respondentLabel?: string|null }
```

## 2. Server actions (dashboard/admin mutations)

All live in `src/lib/actions/`. Each calls `requirePermission` first; returns
`{ error?: string }` (or data) and revalidates the relevant path.

### Questionnaire builder (`dashboard.ts`)
| Action | Permission | Service |
|---|---|---|
| `createQuestionnaireAction` | MANAGE_QUESTIONNAIRES | createQuestionnaire (sets `createdBy`) |
| `updateQuestionnaireSettingsAction` | MANAGE_QUESTIONNAIRES | updateQuestionnaire |
| `sendInvitationsAction` | MANAGE_QUESTIONNAIRES | sendInvitations (TKT-001) |
| `setStatusAction` | MANAGE_QUESTIONNAIRES | setQuestionnaireStatus |
| `addQuestionAction` | MANAGE_QUESTIONNAIRES | addQuestion (returns question for instant render) |
| `updateQuestionSettingsAction` | MANAGE_QUESTIONNAIRES | updateQuestionSettings (rule validation) |
| `updateQuestionMasterVersionAction` | MANAGE_QUESTIONNAIRES | updateQuestionMasterVersion (re-pin) |
| `updateQuestionOptionSetAction` | MANAGE_QUESTIONNAIRES | updateQuestionOptionSet (override) |
| `removeQuestionAction` | MANAGE_QUESTIONNAIRES | removeQuestion |
| `reorderQuestionsAction` | MANAGE_QUESTIONNAIRES | reorderQuestions |
| `duplicateQuestionnaireAction` | MANAGE_QUESTIONNAIRES | duplicateQuestionnaire |
| `createBlockAction` / `updateBlockAction` / `deleteBlockAction` / `setQuestionBlockAction` / `reorderBlockAction` | MANAGE_QUESTIONNAIRES | block CRUD + move + reorder |

### Master data (`dashboard.ts`)
| Action | Permission | Service |
|---|---|---|
| `saveQuestionMasterAction` (create) | CREATE_QUESTION_MASTER | createQuestionMaster |
| `saveQuestionMasterAction` (update) | MANAGE_MASTER_DATA | updateQuestionMaster (new version) |
| `deleteQuestionMasterAction` | MANAGE_MASTER_DATA | deleteQuestionMaster |
| `saveOptionSetAction` | MANAGE_MASTER_DATA | createOptionSet / updateOptionSet |
| `deleteOptionSetAction` | MANAGE_MASTER_DATA | deleteOptionSet |

### Users (`dashboard.ts`)
| Action | Permission | Service |
|---|---|---|
| `createUserAction` | MANAGE_USERS | createUser |
| `updateUserAction` | MANAGE_USERS | updateUser / setUserActive |
| `resetPasswordAction` | MANAGE_USERS | resetPassword |

### RAG (`dashboard.ts`)
| Action | Permission | Service |
|---|---|---|
| `generateQuestionnaireAction` | MANAGE_QUESTIONNAIRES | generateQuestionnaireFromPrompt |

### Auth (`auth.ts`)
| Action | Notes |
|---|---|
| `loginAction` | rate-limited (5/15min per email+ip); bcrypt verify; sets session cookie |
| `logoutAction` | clears cookie |

### Responses (TKT-017, `responses.ts`)
| Action | Permission + gate | Service |
|---|---|---|
| `deleteResponseAction` | MANAGE_QUESTIONNAIRES + `assertCanManageQuestionnaire` | deleteResponse |
| `mailblastRespondentAction` | MANAGE_QUESTIONNAIRES + ownership | mailblastRespondent |
| `updateResponseAction` | MANAGE_QUESTIONNAIRES + ownership | saveResponse (**blocked for COMPLETED** — F-005) |

## 3. Pages & routes

### Public
- `/` — landing (active questionnaires)
- `/f/[slug]` — fill form (supports `?invite=<token>`)
- `/login` — dashboard sign-in

### Dashboard (session required, middleware)
- `/dashboard` — questionnaire list + create + duplicate
- `/dashboard/new` — create form
- `/dashboard/generate` — AI generation (RAG)
- `/dashboard/questionnaires/[id]/edit` — builder (settings, questions,
  blocks, rules, sampleEmails + generate/send links)
- `/dashboard/questionnaires/[id]/responses` — response list (per-row action
  menu: view/edit/delete/mailblast, TKT-017)
- `/dashboard/questionnaires/[id]/responses/[rid]` — response detail
- `/dashboard/questionnaires/[id]/responses/[rid]/edit` — admin edit
  (ownership-gated)
- `/dashboard/questionnaires/[id]/report` — KPIs, daily chart, per-question
  stats, export buttons (JSON / xlsx)

### Admin (`/admin/*`, ADMIN role via middleware + service checks)
- `/admin/users` — user management
- `/admin/question-masters` — question bank (operator create only)
- `/admin/option-sets` — option sets incl. external API config + Test button

## 4. Permissions matrix (verified in rbac.ts)

| Capability | ADMIN | OPERATOR |
|---|---|---|
| Manage users | ✅ | ❌ |
| Manage master data (edit/delete masters, option sets) | ✅ | ❌ |
| Create question masters | ✅ | ✅ |
| Manage questionnaires (build, publish, responses, export) | ✅ | ✅ (own + legacy via TKT-017) |
| Fill public forms | anyone | anyone |

## 5. Ownership gate (TKT-017)

`assertCanManageQuestionnaire(session, questionnaireId)`:
- ADMIN → allowed always
- OPERATOR → allowed if `createdBy === session.sub` OR `createdBy === null`
  (legacy rows stay workable)
- anonymous → 401

Applied to: response delete/mailblast/edit actions and the edit page. Note it
gates **response management**; questionnaire list/edit itself is not yet
ownership-scoped (all operators can see and edit any questionnaire —
F-012 org scoping will address this).

## 6. Error contract

All AppError subclasses map to HTTP:
| Error | Status | Code |
|---|---|---|
| UnauthorizedError | 401 | UNAUTHORIZED |
| ForbiddenError | 403 | FORBIDDEN |
| NotFoundError | 404 | NOT_FOUND |
| ValidationError | 422 | VALIDATION_ERROR / custom |
| AppError (generic) | 4xx | custom e.g. RATE_LIMITED, SLUG_TAKEN, RESPONSE_COMPLETED, MASTER_IN_USE, OPTION_SET_IN_USE |
| unexpected | 500 | INTERNAL |
