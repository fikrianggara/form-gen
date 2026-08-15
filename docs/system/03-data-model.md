# 03 — Data Model

Source of truth: `prisma/schema.prisma` (verified against merged main, incl.
TKT-017). All IDs are cuid strings unless noted.

## 1. ER overview

```
User ──creates──▶ Questionnaire ──has──▶ QuestionnaireBlock
                    │    │                  │
                    │    │                  └──has──▶ QuestionnaireQuestion
                    │    │                              │  │
                    │    └──has──▶ Invitation           │  └──children (parentId)
                    │              │                    │
                    │              └──▶ (links to)      │
                    │                                   │
                    └──has──▶ Response ◀──(respondent)──┘
                                │
                                ├──has──▶ AnswerGroup (repeatable row)
                                │              │
                                └──has──▶ Answer ◀──(answerGroupId nullable)

QuestionMaster (versioned) ──has──▶ OptionSet (versioned) ──has──▶ Option
      │                               │
      └──referenced by QuestionnaireQuestion (questionMasterId)

User ──has──▶ LoginAttempt (rate-limit audit)
Questionnaire ──(createdBy)──▶ User (nullable, TKT-017)
```

## 2. Enums

| Enum | Values |
|------|--------|
| `Role` | `ADMIN`, `OPERATOR` |
| `QuestionType` | `TEXT`, `TEXTAREA`, `NUMBER`, `DATE`, `RADIO`, `CHECKBOX`, `SELECT`, `RATING` |
| `OptionSource` | `STATIC`, `EXTERNAL_API` |
| `QuestionnaireStatus` | `DRAFT`, `ACTIVE`, `CLOSED` |
| `ResponseStatus` | `DRAFT`, `COMPLETED` |

## 3. Models

### User
- `id`, `email` (unique), `name`, `passwordHash`, `role` (default OPERATOR),
  `isActive` (default true), `createdAt`, `updatedAt`.

### LoginAttempt (rate-limit audit, TKT-003)
- `id`, `email`, `ip`, `createdAt`; index `[email, ip, createdAt]`.
- Semantics: failures per (email, ip) in a 15-min sliding window; 5 max.

### QuestionMaster (versioned question bank)
- `id`, `code`, `version` (default 1), `isLatest` (default true), `title`,
  `description?`, `questionType`, `requiredDefault`, `placeholder?`,
  `minValue?`, `maxValue?`, `maxLength?`, `ratingMax?` (default 5),
  `optionSetId?` → OptionSet, `embedding` (vector(1024), unsupported type),
  timestamps.
- Unique: `[code, version]`; index `[code, isLatest]`.
- **Versioning**: editing creates a new row (same code, version+1, isLatest
  true; previous flipped false). Immutable once created.

### OptionSet (versioned answer master data)
- `id`, `name`, `familyId?` (stable identity across renames), `version`
  (default 1), `isLatest`, `source` (STATIC | EXTERNAL_API), `apiUrl?`,
  `apiMethod?` (default GET), `apiHeaders?` (Json), `itemsPath?`,
  `apiLabelKey?`, `apiValueKey?` (dotted nested keys, TKT-010), timestamps.
- Unique: `[name, version]`; indexes `[name, isLatest]`, `[familyId]`.
- Versioning: same as QuestionMaster, keyed on `familyId`.

### Option
- `id`, `optionSetId` → OptionSet (cascade), `label`, `value`, `order`.
- Unique: `[optionSetId, value]`.

### Questionnaire
- `id`, `title`, `description?`, `slug` (unique), `status` (default DRAFT),
  `acceptMultipleResponses` (default true), `requiresAccount` (default false,
  **dead field** — F-006), `sampleEmails` (Json, default `[]`, TKT-001),
  `createdBy?` → User (nullable, TKT-017), timestamps.
- Relations: invitations, questions, blocks, responses.

### Invitation (TKT-001)
- `id`, `questionnaireId` → Questionnaire (cascade), `email`, `token`
  (unique, 32-hex), `sentAt?`, `clickedAt?`, `responseId?` (plain String,
  **not a FK** — F-009), timestamps.
- Index `[questionnaireId]`.
- Semantics: one unique link per sample email; NO Response row until the
  respondent's first save (lazy creation).

### QuestionnaireBlock (TKT-007)
- `id`, `questionnaireId` → Questionnaire (cascade), `title`, `order`,
  `entryRule?` (Json — multi-set visibility rule), timestamps.
- Index `[questionnaireId, order]`.

### QuestionnaireQuestion
- `id`, `questionnaireId` → Questionnaire (cascade),
  `questionMasterId` → QuestionMaster (no cascade — version-pinned),
  `order`, `required` (default false), `visibilityRule?` (Json),
  `isRepeatable`, `isAggregate`, `aggregateConfig?` (Json),
  `parentId?` → QuestionnaireQuestion (self-rel "RepeatableParent", cascade),
  `children` (reverse), `aiSuggested`, `aiConfidence?`, `aiLowConfidence`,
  `optionSetId?` → OptionSet (per-question override), `blockId?` →
  QuestionnaireBlock (SetNull on delete).
- Unique: `[questionnaireId, questionMasterId, parentId]` (NULLs distinct —
  dup detection for top-level is explicit in service).

### Response
- `id`, `questionnaireId` → Questionnaire (cascade), `respondentToken`
  (browser/invite identity), `respondentLabel?` (name/email), `status`
  (default DRAFT), `progress` (int 0-100), `completedAt?`, timestamps.
- Index `[questionnaireId, respondentToken]`.

### AnswerGroup (repeatable row)
- `id`, `responseId` → Response (cascade), `parentQuestionId` →
  QuestionnaireQuestion (cascade), `rowIndex`, timestamps.
- Unique: `[responseId, parentQuestionId, rowIndex]`.

### Answer
- `id`, `responseId` → Response (cascade), `questionId` →
  QuestionnaireQuestion (cascade), `answerGroupId?` → AnswerGroup (cascade),
  `textValue?`, `numberValue?` (Float), `dateValue?` (DateTime),
  `jsonValue?` (Json — checkbox string[]), `isComputed` (default false),
  timestamps.
- Index `[responseId]`.

## 4. Value mapping by question type

| Type | Stored column |
|------|---------------|
| TEXT / TEXTAREA / RADIO / SELECT | `textValue` |
| NUMBER / RATING | `numberValue` |
| DATE | `dateValue` (wire format `yyyy-MM-dd` via `serializeDateValue`) |
| CHECKBOX | `jsonValue: string[]` |
| aggregate | `numberValue` with `isComputed: true` |

## 5. JSON shapes (domain contracts)

### visibilityRule (legacy + multi-set)
```ts
type VisibilityRule = {
  condition?: "ALL" | "ANY";
  rules?: VisibilityRuleClause[];          // legacy single set
  sets?: VisibilityRuleSet[];              // multi-set (OR between sets)
}
type VisibilityRuleClause = {
  dependsOnQuestionId: string;
  operator: "EQ"|"NEQ"|"GT"|"GTE"|"LT"|"LTE"|"CONTAINS"|"ANY_OF"|"NONE_OF";
  value: string | number | string[];
}
type VisibilityRuleSet = { condition: "ALL" | "ANY"; rules: VisibilityRuleClause[] }
```

### aggregateConfig
```ts
type AggregateConfig = { type: "SUM"; sourceQuestionId: string }
```

### sampleEmails
```ts
type SampleEmails = string[]  // raw email list on Questionnaire
```

## 6. Key integrity notes

- Question → Master is **not** cascade: deleting a master is blocked while any
  questionnaire references it (`MASTER_IN_USE`); same for option sets
  (`OPTION_SET_IN_USE`).
- Response delete cascades to AnswerGroup + Answer; `deleteResponse` also
  detaches linked invitations (manual, because `responseId` is not a FK).
- Deleting a block sets questions' `blockId` to null (SetNull).
- No audit columns on Response (F-008); `Invitation.responseId` unenforced
  (F-009); `requiresAccount` unused (F-006).
