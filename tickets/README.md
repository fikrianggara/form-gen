# Project Tickets & Parallel Branch Workflow

This project runs like a real co-worked team. Every feature or bug is a
**ticket** in this directory; work happens on isolated **branches**; branches
merge into `main` only when parallel work is finished (or on explicit
instruction from the owner).

## Ticket lifecycle

| Status    | Meaning                                                            |
|-----------|--------------------------------------------------------------------|
| `backlog` | Logged, not yet assigned. Anyone may pick it up.                   |
| `ongoing` | Assigned and in progress. Hands-off for every other agent.         |
| `done`    | Unit + integration tests pass. Ready to merge. Branch NOT merged.  |
| `merged`  | Branch merged into `main` by the merge orchestrator.               |
| `cancelled` | Dropped / superseded.                                            |

## Rules (every agent MUST follow)

1. **Read `INDEX.md` before starting anything.** Never start work that is
   already `ongoing` or `done` — it is being processed by someone else.
2. **Create a ticket first.** New feature or bug → `scripts/ticket.sh new`.
3. **Never write code on `main`.** `main` receives only ticket-status doc
   commits. Code lives on `feat|fix/TKT-###-<slug>` branches.
4. **Assign + start via the CLI:** `scripts/ticket.sh start TKT-###`
   flags the ticket `ongoing`, creates the branch, and provisions the
   per-ticket test database `form_gen_test_tkt###`.
5. **Test on YOUR database:** run integration tests with
   `DATABASE_URL="postgresql://fikrianggara@localhost:5432/form_gen_test_tkt###" npx vitest run`
   — never the shared `form_gen_test` while other agents work.
6. **Dev servers** run on `3100 + ticket number` (TKT-001 → 3101) to avoid
   port collisions.
7. **Clean tree before any `git checkout`.** Commit or stash your work first;
   uncommitted changes can clobber another agent's checkout.
8. **Finish with the CLI:** after tests pass,
   `scripts/ticket.sh done TKT-### "summary of changes"` — this marks the
   ticket `done` + `readyToMerge` on `main` (visible to everyone) but does NOT
   merge the branch.
9. **Merge only via the orchestrator:** `scripts/merge-tickets.sh` merges all
   `done` branches into `main` (no-ff), runs the full gate chain, marks
   tickets `merged`, and drops the ticket test DBs. It refuses to run while
   any ticket is `ongoing` unless the owner passes `--force`.
10. **If `main` moved while you worked**, merge/rebase `main` into your branch
    before marking `done` — never force-push or rewrite shared history.

## CLI reference

```bash
scripts/ticket.sh new "<title>" [bug] [size] [group] [severity]  # create backlog ticket (next id); severity P0|P1|P2
scripts/ticket.sh start TKT-###            # flag ongoing, branch, test DB
scripts/ticket.sh done TKT-### "<summary>" # flag done + readyToMerge + notes
scripts/ticket.sh status TKT-###           # print ticket frontmatter
scripts/ticket.sh list                     # regenerate INDEX.md
scripts/ticket.sh db-create TKT-###        # create + migrate ticket test DB
scripts/ticket.sh db-drop TKT-###          # drop ticket test DB
scripts/merge-tickets.sh [--force] [--push]# merge done branches into main
```

## Ticket size & group

Every ticket carries a **size** and a **group** in its frontmatter:

- `size`: `small | medium | big` — an estimate of implementation effort, decided
  when the ticket is analyzed/backlogged. INDEX.md shows it so anyone picking
  work can see the weight at a glance.
- `severity`: `P0 | P1 | P2` — business/risk priority, decided when the ticket
  is analyzed/backlogged. P0 = blocker (shipping-breaking, security, data
  integrity), P1 = high (should be scheduled soon), P2 = normal (nice-to-have /
  planned capability). INDEX.md shows it as the `sev` column.
- `group`: an epic/branch group. Tickets in the same group are **worked on the
  same branch** — the shared branch is created when the first ticket of the
  group is started, and `start` on a later ticket of the same group **joins the
  ongoing branch** instead of creating a new one (one group = one branch/run,
  one merge). A ticket with no group gets its own branch as before.

## Ticket timestamps (created / updated / createdAt / updatedAt)

Every ticket file carries four timestamp fields in its frontmatter. They tell
you **when a ticket was issued and when it last changed** — visible in
INDEX.md's `created` / `updated` columns.

| Field | Format | Meaning | Maintained by |
|-------|--------|---------|---------------|
| `created` | `YYYY-MM-DD` | Issue date (when `ticket.sh new` ran) | `ticket.sh new` |
| `updated` | `YYYY-MM-DD` | Last status-change date | `ticket.sh start` / `done` |
| `createdAt` | ISO-8601 `YYYY-MM-DDTHH:MM:SS±HH:MM` | Precise issue timestamp | `ticket.sh new` (now); legacy tickets backfilled from **first git commit** touching the file |
| `updatedAt` | ISO-8601 | Precise last-change timestamp | `ticket.sh start` / `done` (now); legacy backfilled from **last git commit** |

Rules:

1. **Never hand-edit these fields** — `ticket.sh` owns them (`new` stamps
   created/createdAt; `start`/`done` stamp updated/updatedAt).
2. `created`/`createdAt` are immutable once the ticket exists; `updated`/
   `updatedAt` advance on every status change.
3. Legacy backfill note: for tickets committed a day after they were filed
   (filed via `new`, committed later), `createdAt` = the first commit time —
   the true issue moment may be up to a day earlier; `created` keeps the
   recorded issue date.
4. INDEX.md's `created`/`updated` columns come from the frontmatter — never
   edit INDEX.md by hand, always `scripts/ticket.sh list`.

## Groups in this project (see the `group` field per ticket):

| group | tickets | theme |
|-------|---------|-------|
| respondent-auth | TKT-001..003 | accounts, verification, rate limit |
| rule-engine | TKT-006..007 | visibility engine + question blocks |
| external-mapping | TKT-009..010 | MSSD remapping, option keys |
| questionnaire-extras | TKT-012..013 | sample upload, mailblast |
| proposal | TKT-005 | survey proposal workflow |
| ai-sourcing | TKT-008 | AI generation round 2 |
| admin-polish | TKT-011 | conditional field disabling |
| org-scoping | TKT-014 | organization scoping |
| user-accounts | TKT-051..053 | public registration, admin activation, Google OAuth |
| api-key-promotion | TKT-054 | operator key request → approval promotes to DEV |
| org-admin | TKT-055..056 | org membership model, invites, join approval, org roles |
| org-key-visibility | TKT-057 | org-scoped API key visibility (needs TKT-039) |
| nav-shell | TKT-058..059 | sidebar nav shell (P0) + landing auth header |
| ui-theme | TKT-060 | design tokens + dark mode (sequence with nav-shell) |
| proposal-org-ai | TKT-061 | proposal new-org → approve creates org+survey+AI questionnaire |
| ai-question-editing | TKT-062 | AI add/edit question in editor |
| question-editing | TKT-063 | manual inline question editing (verify first) |
| qa-verification | TKT-064..065 | verify conditional display; DEV login bug |
| api-key-ux | TKT-066 | copy-to-clipboard for API keys |
| profile-page | TKT-067 | profile: password, role, org (join via org-admin) |
| dashboard-stats | TKT-068 | dashboard stats + survey tags |
| ai-credits | TKT-069..070 | AI credit system: daily allowance, deduction, admin management |

## Ticket file format

One markdown file per ticket with YAML frontmatter — machine-parseable by any
agent tool. See `TKT-000-template.md`.

## Project configuration

The scripts are self-locating and portable (they resolve their root from
their own location, not from this repo). A project can override defaults via
`scripts/ticket.config.sh` or `TKT_*` env vars (`TKT_DB_URL_BASE`,
`TKT_TEST_DB_PREFIX`, `TKT_DEFAULT_ASSIGNEE`, `TKT_PORT_BASE`, `TKT_TEST_CMD`,
`TKT_MIGRATE_CMD`, `TKT_GATE_CMD`); empty overrides disable the step. This
repo has no config file — form-gen defaults apply. The
`ticket-system-bootstrap` skill scaffolds the whole system into a new
project.
