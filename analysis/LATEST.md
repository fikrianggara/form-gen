# FormGen — System Analysis v01 (2026-08-15)

Baseline analysis after the TKT-017 merge. Scope: architecture, data model,
security surface, spec-vs-code drift, and backlog health. Owner instruction:
each finding is a section with a decision line; the owner reviews and decides
what to do next.

## System state at time of analysis

- Merged & working: core engine (masters, option sets, builder, multi-set
  visibility rules, question blocks, repeatables, aggregates, response
  lifecycle, report/export), RBAC + JWT sessions, rate-limited login,
  unique-link distribution + lazy response creation (TKT-001), response action
  menu + createdBy ownership (TKT-017), small-wins batch (TKT-011/015/016).
- In flight: TKT-018 (system icons) — owned by another agent (jarvis), branch
  `feature-TKT-018-system-wide-action-icons`. Hands-off.
- Backlog: TKT-002, TKT-005, TKT-008, TKT-009, TKT-012, TKT-013, TKT-014.
- Verified gates on merged main at time of writing: schema has `createdBy` +
  `access-control.service.ts` + `response-admin.service.ts` (TKT-017 merged).

---

## F-001 — Mailer has no real SMTP transport (P0)

- **Severity:** P0 — shipping blocker.
- **Status:** open
- **Evidence:** `src/services/mail.service.ts` — only `consoleTransport`
  exists; `sendMail` defaults to it. No SMTP transport, no nodemailer in
  `package.json`, no SMTP env config in `.env.example`.
- **Impact:** Every mailblast (TKT-001 invite flow, TKT-017 mailblastRespondent)
  is a console.log today. TKT-001's "SMTP-ready transport" claim is aspirational
  — the abstraction exists, the transport does not. Unique-link distribution's
  core promise (emails arrive) is undeliverable.
- **Recommendation:** Implement a real SMTP transport (nodemailer or
  transactional API like Resend/Mailgun) behind the existing `MailTransport`
  interface; add SMTP env vars to `.env.example`; keep console fallback for
  dev/test. This unblocks TKT-013.
- **Owner decision:** (pending)

---

## F-002 — Invitation links are relative URLs (P0)

- **Severity:** P0 — shipping blocker (with F-001).
- **Status:** open
- **Evidence:** `src/services/invitation.service.ts:122` and
  `src/services/response-admin.service.ts` build
  `` link = `/f/${q.slug}?invite=${inv.token}` `` — a relative path.
- **Impact:** Once real mail lands, recipients click a relative path that
  resolves against their mail client, not the app. Broken invitations.
- **Recommendation:** Add an absolute base URL config (e.g. `APP_URL` /
  `NEXT_PUBLIC_APP_URL`) and build `link = `${base}/f/${slug}?invite=${token}``.
  Validate the base URL at startup or first use.
- **Owner decision:** (pending)

---

## F-003 — Invitation tokens: no expiry, no single-use enforcement (P0)

- **Severity:** P0 — security / data integrity.
- **Status:** open
- **Evidence:** `src/services/invitation.service.ts` (`getInvitationByToken`,
  `markInvitationClicked`); `src/app/api/invitations/[token]/route.ts` — the
  route only stamps `clickedAt`; nothing rejects a second click. The mail copy
  (mail.service.ts:49) claims "This link is personal to you and can be used
  once."
- **Impact:** For `acceptMultipleResponses=true` questionnaires, one leaked or
  forwarded token yields unlimited responses. No revocation mechanism. For
  BPS-style sensitive surveys this is a confidentiality + data-integrity hole.
- **Recommendation:** Add token expiry (e.g. N days), single-use consumption
  (reject after a response is linked / after first completion), and an admin
  revoke action. Decide the exact semantics with the owner before coding.
- **Owner decision:** (pending)

---

## F-004 — Public response endpoints are unthrottled (P0)

- **Severity:** P0 — abuse / DoS surface.
- **Status:** open
- **Evidence:** `src/app/api/questionnaires/[slug]/responses/route.ts` (POST)
  and `[id]/route.ts` (PATCH) have no rate limiting; `rate-limit.service.ts`
  is wired only to the dashboard login (`src/lib/actions/auth.ts`).
- **Impact:** Anonymous bots can spam-create Response rows and answer payloads
  (storage/CPU DoS) on any ACTIVE questionnaire. The rate-limit service exists
  and is reusable; it is simply not connected to the public surface.
- **Recommendation:** Rate-limit per (respondentToken/IP) on POST/PATCH
  response routes; consider a per-questionnaire cap. Reuse
  `rate-limit.service.ts` (rename/generalize it beyond login).
- **Owner decision:** (pending)

---

## F-005 — Admin edit of COMPLETED responses blocked by save engine (P0)

- **Severity:** P0 — freshly merged feature gap.
- **Status:** open
- **Evidence:** TKT-017's `updateResponseAction`
  (`src/lib/actions/responses.ts`) calls `saveResponse`, which throws
  `RESPONSE_COMPLETED` for any completed response
  (`src/services/response.service.ts:270-276`). The edit form
  (`ResponseEditForm.tsx`) posts status COMPLETED/DRAFT but the engine rejects
  before looking at input.
- **Impact:** TKT-017 acceptance criterion "Edit opens the response prefilled
  and saves updates to answers" fails server-side with 409 for exactly the
  completed responses an admin most needs to correct.
- **Recommendation:** Decide with owner: (a) permission-gated admin override
  (allow save on completed with an audit note + refresh completedAt), or
  (b) keep immutable and disable Edit for completed rows in the UI, amending
  the criterion. Option (a) is my recommendation; it pairs with F-008.
- **Owner decision:** (pending)

---

## F-006 — `requiresAccount` dead schema field (P1)

- **Severity:** P1 — schema debt.
- **Status:** open
- **Evidence:** `prisma/schema.prisma` — `Questionnaire.requiresAccount
Boolean @default(false)`; nothing reads or writes it (TKT-001 explicitly
  cancelled accounts).
- **Impact:** Confusing schema surface; a future agent may assume accounts
  exist. Zero runtime cost but real cognitive cost.
- **Recommendation:** Drop the column in a migration, or repurpose it if
  accounts ever return. Low risk, small migration.
- **Owner decision:** (pending)

---

## F-007 — TKT-002 stale: email verification/password reset for respondents (P1)

- **Severity:** P1 — ticket hygiene.
- **Status:** open
- **Evidence:** `tickets/TKT-002.md` — presupposes respondent accounts,
  cancelled by TKT-001's re-scope (no accounts, unique links instead).
  TKT-013's Notes also say "Depends on TKT-001 (respondent accounts)" — stale.
- **Impact:** Backlog misleads agents into scoping work against a dead premise
  (exactly the TKT-003 trap the skill warns about).
- **Recommendation:** Cancel TKT-002 or re-scope it to something real (e.g.
  invitation expiry/revocation — see F-003). Fix TKT-013's dependency note.
- **Owner decision:** (pending)

---

## F-008 — No audit trail on admin response edits (P1)

- **Severity:** P1 — data provenance.
- **Status:** open
- **Evidence:** TKT-017 `updateResponseAction` saves via `saveResponse` with no
  record of who edited or when; `Response` has no `editedBy`/`editedAt`.
- **Impact:** An admin can rewrite a respondent's answers with no trace. For a
  survey system (esp. BPS context) provenance matters.
- **Recommendation:** Add `editedBy` (FK User) + `editedAt` on Response, or a
  small `ResponseEditLog` table. Pairs with F-005 option (a).
- **Owner decision:** (pending)

---

## F-009 — `Invitation.responseId` is a plain String, not a relation (P1)

- **Severity:** P1 — referential integrity.
- **Status:** open
- **Evidence:** `prisma/schema.prisma` — `Invitation.responseId String?` with
  no FK; detach is manual in `deleteResponse`
  (`src/services/response-admin.service.ts`).
- **Impact:** Schema allows dangling refs; no cascade safety net. Works today
  because the service layer is careful, but the model does not enforce it.
- **Recommendation:** Make `responseId` a proper relation
  (`response Response? @relation(...)`), decide delete semantics.
- **Owner decision:** (pending)

---

## F-010 — Mail HTML is not escaped (P1)

- **Severity:** P1 — correctness/security hygiene.
- **Status:** open
- **Evidence:** `buildInvitationMail` (`src/services/mail.service.ts:37-52`)
  interpolates `questionnaireTitle` and `link` into HTML verbatim.
- **Impact:** A questionnaire title containing markup injects into the email
  body. Low severity for operator-typed titles, but it is a one-line fix and
  the codebase already has no HTML-escaping helper.
- **Recommendation:** Escape HTML in the mail template (small `escapeHtml`
  helper in mail.service).
- **Owner decision:** (pending)

---

## F-011 — INDEX.md bookkeeping lagged the TKT-017 merge (P1)

- **Severity:** P1 — process hygiene.
- **Status:** open
- **Evidence:** `git log` shows `2811413 merge: TKT-017 ...` on main, but
  `tickets/INDEX.md` still lists TKT-017 as `done`/`readyToMerge: true`; the
  ticket file itself may be stale vs main's copy.
- **Impact:** Another agent could mis-read TKT-017 as unmerged. Status on main
  is authoritative; regenerate INDEX from main.
- **Recommendation:** Run `scripts/ticket.sh list` on main (or fix the merge
  tooling to flip `merged`). Verify `git show main:tickets/TKT-017.md`.
- **Owner decision:** (pending)

---

## F-012 — No organization scoping (TKT-014) (P2)

- **Severity:** P2 — capability gap (largest structural).
- **Status:** open
- **Evidence:** No `Organization`/`Survey` models; `createdBy` ownership
  (TKT-017) is a thin patch; every operator sees every questionnaire.
- **Impact:** For multi-org use (BPS context) operators cannot be isolated;
  master-data visibility (TKT-008) has no foundation.
- **Recommendation:** Start TKT-014 (big) deliberately after the P0/P1 fixes
  and TKT-018. It is the foundation for TKT-005 and TKT-008.
- **Owner decision:** (pending)

---

## F-013 — No CI pipeline for the gate chain (P2)

- **Severity:** P2 — process/infra.
- **Status:** open
- **Evidence:** No `.github/workflows`; gate chain (tsc → vitest → lint →
  build) exists only as local scripts.
- **Impact:** With parallel agents merging, schema/client drift and merge
  regressions are caught only by whoever runs the local chain.
- **Recommendation:** Add a GitHub Actions workflow running the full gate
  chain on PR and on push to main (with a real Postgres service for the
  integration suite). Small, high leverage.
- **Owner decision:** (pending)

---

## F-014 — TKT-008 AI round 2 not started (P2)

- **Severity:** P2 — planned backlog.
- **Status:** open
- **Evidence:** `tickets/TKT-008.md` (backlog, big, group ai-sourcing): novel
  question flagging, add-to-master modal, admin validation, master visibility.
- **Impact:** AI generation (round 1) exists but lacks the validation +
  visibility governance this ticket scopes. Not blocking anything today.
- **Recommendation:** Keep in backlog; schedule after org-scoping (TKT-014)
  since master visibility interacts with it.
- **Owner decision:** (pending)

---

## F-015 — TKT-012 blocked on unanswered clarification (P2)

- **Severity:** P2 — ticket hygiene.
- **Status:** open
- **Evidence:** `tickets/TKT-012.md` — "CLARIFY: sample of WHAT?" with
  acceptance criteria "(pending clarification)".
- **Impact:** The ticket sits in backlog un-actionable; the question was never
  answered.
- **Recommendation:** Resolve the clarification with the owner (sample data
  file for respondents? attachment on the form? builder doc?) or cancel.
- **Owner decision:** (pending)

---

## Summary / recommended next moves

1. Fix batch (P0): F-001 real SMTP transport, F-002 absolute links, F-003
   invite expiry/single-use, F-004 rate-limit public routes, F-005 admin
   override for completed edits.
2. Hygiene batch (P1): F-006 drop dead column, F-007 cancel/re-scope TKT-002,
   F-008 audit trail, F-009 relation, F-010 escape HTML, F-011 fix INDEX.
3. Infra (P2): F-013 CI workflow.
4. Structure (P2): F-012 org scoping (TKT-014) after the above; then F-014.
5. Resolve or cancel F-015.

Versioned per owner instruction. Next analysis run: `analysis/v02_<date>.md`.
