# FormGen — Product Specification

> Version: 1.0
> Status: Approved for implementation
> Owner: Fikri

## 1. Overview

FormGen is a Google Forms–style form engine. It lets administrators and operators
manage reusable question banks and answer-option master data, compose questionnaires
from that bank, apply conditional logic and computed (aggregate) questions, and
collect responses with draft/completed lifecycle and progress tracking.

## 2. Goals / Non-Goals

### Goals
- Reusable master data for questions and answer options.
- Questionnaire builder with ordering, required flags, conditional visibility, repeatable groups, and aggregate questions.
- Rich question types: text, textarea, date, number, radio, checkbox, select, rating.
- External API–backed option lists.
- Response lifecycle: draft → completed, with progress.
- RBAC: admin / operator.
- Clean, tested code (unit + integration) and a clean UI.

### Non-Goals (v1)
- No multi-language support, no i18n.
- No email notifications.
- No file upload question type.
- No anonymous vs. authenticated respondent distinction beyond a respondent token.
- No real-time collaboration on builder.

## 3. Actors & Permissions (RBAC)

| Capability | Admin | Operator |
|---|---|---|
| Manage users (create/update/disable/reset password, assign roles) | ✅ | ❌ |
| Manage option sets / master data (create, update, delete) | ✅ | ❌ |
| Create question masters | ✅ | ✅ (create only) |
| Update/delete question masters | ✅ | ❌ |
| Create/update questionnaires & questions | ✅ | ✅ |
| Publish/close questionnaires | ✅ | ✅ |
| View responses | ✅ | ✅ |
| Fill public forms | anyone (no auth) | anyone |

Role model:
- `ADMIN` — full control.
- `OPERATOR` — questionnaire builder + question master creation.
- Respondents need **no account**; a respondent is identified by a browser-held
  respondent token (cookie) and an optional name/email label.

## 4. Question Types

| Type | Input | Notes |
|---|---|---|
| `TEXT` | single-line text | max length from master |
| `TEXTAREA` | multi-line text | |
| `NUMBER` | numeric | min/max, used for aggregates |
| `DATE` | date picker | |
| `RADIO` | one-of options | options from option set (static or API) |
| `CHECKBOX` | many-of options | options from option set |
| `SELECT` | dropdown single choice | options from option set |
| `RATING` | 1..5 star rating | configurable max |

Each question master also carries: code, title, description/help text,
`requiredByDefault`, placeholder, validation hints (min/max/maxLength), and for
choice types a reference to an **OptionSet**.

## 5. Master Data

### 5.1 Question Master
Reusable question definition. Used by the builder as the template for a
questionnaire question.

### 5.2 Option Set (answer master data)
- `name`, `source`: `STATIC` or `EXTERNAL_API`.
- Static: ordered list of options (label + value).
- External API: `apiUrl`, `method`, optional auth header template, and an optional
  JSON pointer (e.g. `data.items`) to locate the array in the response.
  Options are fetched at runtime through a server-side proxy route so the browser
  never hits the external service directly (no CORS issues, no secret leakage).

## 6. Questionnaire

- `title`, `description`, `slug` (public URL), `status`: `DRAFT | ACTIVE | CLOSED`.
- `acceptMultipleResponses`: if `false`, one response per respondent token;
  submitting again is blocked and the existing response is resumed.
- Ordered questions (`order` field), each referencing a question master, with:
  - `required` (override of master default),
  - `visibilityRule` — conditional logic (see §7),
  - `isRepeatable` — the question is a group header whose child questions can be
    answered **multiple times** (repeating rows),
  - `isAggregate` — computed question (see §8),
  - `parentId` — links child questions to a repeatable parent.

## 7. Cross-Question Rule Validation (Conditional Logic)

A question's `visibilityRule` is JSON:

```json
{
  "condition": "ALL",           // ALL | ANY
  "rules": [
    {
      "dependsOnQuestionId": "q_age",
      "operator": "GTE",
      "value": "18"
    }
  ]
}
```

Operators: `EQ`, `NEQ`, `GTE`, `LTE`, `GT`, `LT`, `CONTAINS` (checkbox),
`ANY_OF` (value is a list), `NONE_OF`.

Semantics: when the rule evaluates **false**, the question is hidden/skipped —
its answer is ignored and it does not count toward required validation or progress.
This implements "if question A answer is x → proceed to question B" (B is shown
only when A matches). Multiple rules combine with ALL (and) / ANY (or).

Evaluation is deterministic and pure (no DB access) so it can be unit-tested and
reused by both the client renderer and the server validator. The server always
re-evaluates — client rules are UX only.

## 8. Aggregate (Computed) Questions

An aggregate question displays/validates a value computed from other answers.
v1 supports summation:

```json
{
  "type": "SUM",
  "sourceQuestionId": "q_expense"   // may live inside a repeatable group
}
```

- If the source is a child of a repeatable group, the sum is computed **across all
  rows** of that group.
- The computed value is stored on the answer row as `computed` (read-only, cannot
  be edited by the respondent) and recalculated on every save.
- v1 scope: `SUM` of one numeric source. (Extensible: `COUNT`, `AVG`, `MAX`, `MIN`.)

## 9. Repeatable Groups (Multi-answer)

Any question can be a **repeatable group header**: `isRepeatable = true`.
Questions with `parentId = <that question>` become the group's fields.
The respondent can add/remove rows; each row is an `AnswerGroup` holding one
answer per child field. Aggregates can target a child across all rows.

## 10. Response Lifecycle

- `status`: `DRAFT` → `COMPLETED`. A completed response is immutable for editing.
- `progress`: 0–100 integer = percentage of visible+required questions answered.
- `completedAt` set on completion; `createdAt`/`updatedAt` maintained.
- Drafts are resumable via a respondent token cookie.
- Single-response questionnaires: creating a second response returns the existing one.

## 11. UI Surface

### Public
- `/` — landing: list of `ACTIVE` questionnaires.
- `/f/[slug]` — fill a questionnaire: progress bar, conditional show/hide,
  repeatable rows, aggregate display, "Save draft" + "Submit".
- `/login` — admin/operator sign-in.

### Dashboard (auth required)
- `/dashboard` — questionnaire list + create.
- `/dashboard/questionnaires/[id]/edit` — builder: settings, question list with
  add-from-master, reorder, required toggle, visibility rule editor, aggregate
  toggle, repeatable toggle.
- `/dashboard/questionnaires/[id]/responses` — response list, per-response detail.
- `/admin/users` — user management (admin only).
- `/admin/question-masters` — question bank (admin full, operator create).
- `/admin/option-sets` — option sets incl. external API config (admin only).

## 12. Acceptance Criteria (summary)

1. Admin can create users with roles; operator cannot see user admin.
2. Admin can CRUD option sets and question masters; operator can create question masters.
3. Builder can assemble a questionnaire from masters, set order/required/rules/aggregates/repeatables.
4. Public form renders question types, fetches API options via proxy, shows/hides by rules, supports repeatable rows, shows aggregate values.
5. Draft saving + resume works; completion sets progress 100, status COMPLETED, immutable.
6. Single-response questionnaire blocks a second response for the same token.
7. Aggregate SUM over a repeatable group equals sum of all rows.
8. Unit tests cover rule engine, aggregates, progress, validation; integration tests cover service layer against real Postgres.
