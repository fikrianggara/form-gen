#!/usr/bin/env bash
# Merge orchestrator: merges every `done` ticket branch into main (no-ff),
# runs the full gate chain, marks tickets merged, drops ticket test DBs.
# Refuses to run while any ticket is `ongoing` unless --force (owner order).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TICKETS="$ROOT/tickets"
FORCE=0
PUSH=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --push)  PUSH=1 ;;
    *) echo "unknown arg: $arg (expected --force / --push)" >&2; exit 1 ;;
  esac
done

cd "$ROOT"
git diff --quiet || { echo "error: working tree is dirty — commit or stash first" >&2; exit 1; }

# ------------------------------------------------------------ project config
# Same override mechanism as ticket.sh: scripts/ticket.config.sh or TKT_* env
# vars; form-gen defaults apply when neither is present. ${VAR-default} so an
# explicitly-empty override (TKT_MIGRATE_CMD="", TKT_GATE_CMD="") disables the
# step instead of falling back.
[[ -f "$ROOT/scripts/ticket.config.sh" ]] && source "$ROOT/scripts/ticket.config.sh"
DB_URL_BASE="${TKT_DB_URL_BASE-postgresql://fikrianggara@localhost:5432}"
TEST_DB_PREFIX="${TKT_TEST_DB_PREFIX-form_gen_test_tkt}"
MIGRATE_CMD="${TKT_MIGRATE_CMD-npx prisma migrate deploy}"
GATE_CMD="${TKT_GATE_CMD-npx tsc --noEmit && npx vitest run && npx next lint && npm run build}"

# Status lives on main — read it from there (a feature branch's ticket copy is stale).
git checkout -q main
git pull --ff-only >/dev/null 2>&1 || true

get_field() { grep -m1 "^${2}:" "$1" | sed -e "s|^${2}: *||" -e 's| *#.*$||' -e 's|[[:space:]]*$||' | sed 's/^"//; s/"$//'; }

# 1. Any ongoing work (from main's view)?
ongoing="$(grep -l '^status: ongoing' "$TICKETS"/TKT-*.md 2>/dev/null || true)"
if [[ -n "$ongoing" && $FORCE -eq 0 ]]; then
  echo "refusing to merge: ongoing tickets still in flight:" >&2
  echo "$ongoing" | sed 's/^/  /' >&2
  echo "wait for them to finish, or pass --force (owner instruction)." >&2
  exit 1
fi

# 2. Done tickets with branches
done_tickets="$(grep -l '^status: done' "$TICKETS"/TKT-*.md 2>/dev/null || true)"
if [[ -z "$done_tickets" ]]; then
  echo "no done tickets to merge — nothing to do."
  exit 0
fi

merged_any=0
while IFS= read -r f; do
  [[ -f "$f" ]] || continue
  id="$(get_field "$f" id)"
  title="$(get_field "$f" title)"
  branch="$(get_field "$f" branch)"
  [[ -n "$branch" ]] || { echo "skip $id: no branch recorded"; continue; }
  if ! git show-ref --verify --quiet "refs/heads/$branch"; then
    echo "skip $id: branch '$branch' does not exist (already merged?)"
    continue
  fi
  echo "== merging $branch ($id: $title)"
  if ! git merge --no-ff "$branch" -m "merge: $id $title (branch $branch)" >/dev/null; then
    echo "CONFLICT merging $branch — resolve, then re-run this script." >&2
    exit 1
  fi
  merged_any=1
done <<< "$done_tickets"

if [[ $merged_any -eq 0 ]]; then
  echo "no branches merged."
fi

# 2.5 Apply pending migrations to the dev database (default: form_gen).
# Merges land migration files on main; without this the dev app throws
# "Invalid prisma.X invocation" until someone runs migrate deploy by hand
# (regression: api-keys page after the public-api merge). Skipped when
# TKT_MIGRATE_CMD is empty (non-Prisma project).
if [[ -n "$MIGRATE_CMD" ]]; then
  echo "== applying pending migrations to dev DB"
  bash -c "$MIGRATE_CMD" 2>&1 | tail -6
fi

# 3. Full gate chain on main (skipped when TKT_GATE_CMD is empty)
if [[ -n "$GATE_CMD" ]]; then
  echo "== validating main: $GATE_CMD"
  bash -c "$GATE_CMD"
fi

# 4. Mark tickets merged + regenerate index (doc commit)
for f in $(grep -l '^status: done' "$TICKETS"/TKT-*.md 2>/dev/null || true); do
  [[ -f "$f" ]] || continue
  id="$(get_field "$f" id)"
  sed -i.bak "s|^status: done$|status: merged|; s|^readyToMerge: true$|readyToMerge: false|; s|^updated: .*|updated: $(date +%F)|" "$f"
  rm -f "$f.bak"
  {
    echo ""
    echo "> **merged** ($(date +%F)): branch merged into main."
  } >> "$f"
  db="${TEST_DB_PREFIX}${id#TKT-}"
  if [[ -n "$DB_URL_BASE" ]]; then
    psql -d postgres -q -c "DROP DATABASE IF EXISTS $db" 2>/dev/null && echo "  dropped db $db" || true
  fi
done
bash "$ROOT/scripts/ticket.sh" list >/dev/null
git add "$TICKETS"
git commit -q -m "tkt: mark merged tickets + regenerate index"
echo "== tickets marked merged, index regenerated, ticket DBs dropped"

if [[ $PUSH -eq 1 ]]; then
  git push origin main
  echo "== pushed origin main"
else
  echo "== not pushed (local). push later with: git push origin main"
fi
echo "== done. main is up to date with all finished branches."
