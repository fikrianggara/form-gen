# AGENTS.md — Working Rules for Every Agent

This project is co-worked by multiple agents in parallel. Read `tickets/README.md`
and `tickets/INDEX.md` before doing anything.

## Hard rules

1. **Never start work that is `ongoing` or `done`** — another agent owns it.
   Check `tickets/INDEX.md` first.
2. **Every feature/bug is a ticket first**: `scripts/ticket.sh new "<title>" [bug]`.
3. **Code only on your ticket branch** (`feat|fix/TKT-###-<slug>`). `main`
   receives ticket-status doc commits only. Never commit code to `main`.
4. **Start a ticket with the CLI**: `scripts/ticket.sh start TKT-###`
   (flags `ongoing`, creates the branch, provisions your test DB).
5. **Integration tests run against YOUR ticket DB**:
   `DATABASE_URL="postgresql://fikrianggara@localhost:5432/form_gen_test_tkt###" npx vitest run`
   Never the shared `form_gen_test` while other agents are working.
6. **Dev servers on port `3100 + ticket number`** (TKT-001 → 3101).
7. **Keep the working tree clean before every `git checkout`** — uncommitted
   work can clobber another agent's branch switch.
8. **Finish with the CLI**: after unit + integration tests pass,
   `scripts/ticket.sh done TKT-### "summary of changes"`. Do NOT merge the
   branch yourself.
9. **Merges happen via `scripts/merge-tickets.sh`** when all parallel work is
   done or the owner says merge.
10. **If `main` moves while you work**, merge/rebase `main` into your branch
    before finishing. Never force-push or rewrite shared branches.

## Project facts

- App: Next.js 14 (App Router) + PostgreSQL 14 + Prisma. Repo root `~/projects/form-gen`.
- Dev DB `form_gen`; shared test DB `form_gen_test`; shadow `form_gen_shadow`.
- Port 3000 belongs to an unrelated app — never use it.
- Embedding pipeline: `npm run db:embed`; hybrid RAG retrieval in `src/services/rag.service.ts`.
- Gate chain before merge: `npx tsc --noEmit && npx vitest run && npx next lint && npm run build`.
- Prisma CLI quirk: `migrate dev` refuses non-interactive shells — use
  `migrate diff --shadow-database-url ... --script` + `migrate deploy`.
