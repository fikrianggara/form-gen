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

Groups in this project (see the `group` field per ticket):

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

## Ticket file format

One markdown file per ticket with YAML frontmatter — machine-parseable by any
agent tool. See `TKT-000-template.md`.
