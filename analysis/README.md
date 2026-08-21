# FormGen — Analysis & Findings Register

> Owner instruction (2026-08-15): every analysis run saves a versioned snapshot
> under `analysis/`. The current analysis is always in `analysis/LATEST.md`.
> When told to "read a finding", read `analysis/LATEST.md`.

## Convention

- Each analysis run writes an immutable snapshot: `analysis/vNN_YYYY-MM-DD.md`
  (v01, v02, ...). Previous snapshots are never edited — history is preserved.
- `analysis/LATEST.md` always holds a copy of the newest snapshot, so there is
  one stable file to open / read.
- `analysis/README.md` (this file) keeps the version table and the decision
  ledger — the quick-review surface.

## Version table

| Version | Date       | Scope | Changes vs previous |
|---------|------------|-------|---------------------|
| v01     | 2026-08-15 | Baseline: full-system gap analysis after TKT-017 merge | — (initial) |
| v02     | 2026-08-15 | Owner review decisions + ticket mapping | All findings decided; severity added to tooling; 8 new tickets (TKT-019..026); TKT-002 cancelled; TKT-012 re-scoped |
| v03     | 2026-08-15 | Public REST web service — requirements analysis | New feature request: API keys + scopes + rate limit + request logging + OpenAPI docs; inventory, proposed surface, schema, security model, 7 open questions, 6-ticket breakdown. Owner decisions recorded 2026-08-17 (self-serve portal + admin approval, Bearer, read-only v1, page/pageSize, SHA-256, +masters/option-sets, static docs) → 7 tickets filed |
| v04     | 2026-08-17 | Org scoping for public REST API access — impact analysis | v03 lacks org dimension; TKT-014 (org code) not yet on main; mapped org model, per-endpoint org semantics, ApiKey.organizationId requirement, dashboard questionnaire-list gap (TKT-014 itself), sequencing note → org-scoped API ticket filed as backlog. Owner decision: proceed with org-scoped API ticket as backlog |
| v05     | 2026-08-17 | Survey management — connect questionnaires, survey tags (M2M), delete survey | Verified: Questionnaire.surveyId single FK (no M2M), no survey page, no deleteSurvey. Impact: schema change to join table + backfill migration, access-control org gate becomes ANY-of-surveys, TKT-039 API filter must follow M2M, delete keeps questionnaires (detach not destroy). → TKT-041..043 filed (group survey-management) |
| v06     | 2026-08-17 | Bug density & defect-pattern analysis | 5 of 43 tickets are bugs (11.6%); UI-feature merge waves produce them; Class A = UI defects (3), Class B = security/hardening caught by register (2). Recommendations R1 (AC line: UI reflects immediately), R2 (codify frontend rules in AGENTS.md), R3 (component tests), R4 (security checklist at merge), R5 (register as bug net), R6 (custom ESLint rule). Owner decision: adopt R1+R2+R4 as conventions, file R3 as ticket |
| v07     | 2026-08-21 | Post-manual-test feature backlog — 17 requests analyzed vs codebase | Each request verified (exists/partial/new); conditional display + survey chips + activation gating already ship (no re-implement); 18 tickets filed TKT-051..068 across 12 groups; nav-shell TKT-058 is P0; dependency chain + risks recorded; open questions Q1..Q6 pending owner decision |
| v08     | 2026-08-21 | Owner decisions on v07 questions + ticket re-scoping | Q1 username column, Q3 org-admin as OrganizationMember.role, Q4 keep orgId shortcut, Q5 keep org+survey + retryable generation, Q6 rule-builder UX build; TKT-051/055/056/059/061/064 re-scoped; Q2 (Google OAuth approach) still open (P2) |

## How to review a finding

Each finding is a section `F-###` containing:

- **Severity** — P0 (shipping blocker / spec-vs-reality drift), P1 (design
  debt / hygiene), P2 (missing capability).
- **Status** — `open` (not decided) | `decided` (owner chose a path) |
  `in-progress` | `done` | `cancelled`.
- **Evidence** — file:line references, not prose claims.
- **Impact** — what breaks or is at risk, in plain terms.
- **Recommendation** — what I propose doing about it.
- **Owner decision** — left blank for review; next analysis run records your
  decision here and advances the status.

## Decision ledger (quick view)

| ID | Title | Severity | Status | Owner decision | Ticket |
|----|-------|----------|--------|----------------|--------|
| F-001 | Mailer has no real SMTP transport | P0 | decided (defer) | Console logging is fine now; real SMTP later, not high priority | — (later) |
| F-002 | Invitation links are relative URLs | P0 | decided | Proceed | TKT-019 |
| F-003 | Invitation tokens: no expiry, no single-use | P0 | decided | Proceed | TKT-020 |
| F-004 | Public response endpoints unthrottled | P0 | decided | Proceed | TKT-023 |
| F-005 | Admin edit of COMPLETED responses blocked | P0 | decided | Status workflow: draft / submitted / edited / approved, DB-persisted | TKT-024 |
| F-006 | `requiresAccount` dead schema field | P1 | decided | Drop column in migration | TKT-025 |
| F-007 | TKT-002 stale (respondent accounts cancelled) | P1 | decided | Cancel the ticket | TKT-002 (cancelled) |
| F-008 | No audit trail on admin response edits | P1 | decided | Proceed + implement F-005 | TKT-024 |
| F-009 | `Invitation.responseId` not a relation | P1 | decided | Proceed | TKT-022 |
| F-010 | Mail HTML not escaped | P1 | decided | Proceed | TKT-021 |
| F-011 | INDEX.md bookkeeping lagged TKT-017 merge | P1 | done | Proceed — resolved (TKT-017/018 merged) | — |
| F-012 | No organization scoping (TKT-014) | P2 | decided | Proceed TKT-014; coder agent's work | TKT-014 |
| F-013 | No CI pipeline for the gate chain | P2 | decided | Local integration now; CI can be added later | TKT-026 |
| F-014 | TKT-008 AI round 2 not started | P2 | decided | Proceed recommendation | TKT-008 |
| F-015 | TKT-012 blocked on unanswered clarification | P2 | decided | Sample = sampling frame; Excel upload; organization_name + contact (phone/email) | TKT-012 (re-scoped) |
| F-016 | Post-manual-test feature backlog (17 requests, v07) | P1 | decided | Owner filed requests after manual testing; analyzed vs codebase; conditional display + survey chips + activation already exist; 18 tickets filed | TKT-051..068 |
| F-017 | Open questions Q1..Q6 from v07 (username vs name, OAuth approach, org-admin model, orgId shortcut, approval atomicity, rule UX) | P1 | decided | Q1 username column; Q3 org-admin = OrganizationMember.role; Q4 keep+sync orgId; Q5 keep org+survey + user-retryable generation; Q6 rule-builder UX. Q2 (OAuth impl) open — defer to TKT-053 pickup | re-scoped in TKT-051/055/056/059/061/064 |

## Latest snapshot

Current: `analysis/v08_2026-08-21.md` (mirrored in `analysis/LATEST.md`)
