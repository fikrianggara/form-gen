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

| Version | Date       | Scope                                                  | Changes vs previous |
| ------- | ---------- | ------------------------------------------------------ | ------------------- |
| v01     | 2026-08-15 | Baseline: full-system gap analysis after TKT-017 merge | — (initial)         |

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

| ID    | Title                                                    | Severity | Status | Owner decision |
| ----- | -------------------------------------------------------- | -------- | ------ | -------------- |
| F-001 | Mailer has no real SMTP transport                        | P0       | open   | pending        |
| F-002 | Invitation links are relative URLs                       | P0       | open   | pending        |
| F-003 | Invitation tokens: no expiry, no single-use              | P0       | open   | pending        |
| F-004 | Public response endpoints unthrottled                    | P0       | open   | pending        |
| F-005 | Admin edit of COMPLETED responses blocked by save engine | P0       | open   | pending        |
| F-006 | `requiresAccount` dead schema field                      | P1       | open   | pending        |
| F-007 | TKT-002 stale (respondent accounts cancelled)            | P1       | open   | pending        |
| F-008 | No audit trail on admin response edits                   | P1       | open   | pending        |
| F-009 | `Invitation.responseId` not a relation                   | P1       | open   | pending        |
| F-010 | Mail HTML not escaped                                    | P1       | open   | pending        |
| F-011 | INDEX.md bookkeeping lagged TKT-017 merge                | P1       | open   | pending        |
| F-012 | No organization scoping (TKT-014)                        | P2       | open   | pending        |
| F-013 | No CI pipeline for the gate chain                        | P2       | open   | pending        |
| F-014 | TKT-008 AI round 2 not started                           | P2       | open   | pending        |
| F-015 | TKT-012 blocked on unanswered clarification              | P2       | open   | pending        |

## Latest snapshot

Current: `analysis/v01_2026-08-15.md` (mirrored in `analysis/LATEST.md`)
