#!/usr/bin/env bash
# Ticket CLI for the parallel-agent workflow. See tickets/README.md for rules.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TICKETS="$ROOT/tickets"
TEST_DB_PREFIX="form_gen_test_tkt"
DB_URL_BASE="postgresql://fikrianggara@localhost:5432"
DEFAULT_ASSIGNEE="jarvis"

cd "$ROOT"

# ------------------------------------------------------------------ helpers

die() { echo "error: $*" >&2; exit 1; }

get_field() { # file key
  grep -m1 "^${2}:" "$1" | sed -e "s|^${2}: *||" -e 's| *#.*$||' -e 's|[[:space:]]*$||' | sed 's/^"//; s/"$//'
}

set_field() { # file key value  (value must be single-line, no colons)
  local file="$1" key="$2" value="$3"
  sed -i.bak "s|^${key}: .*|${key}: ${value}|" "$file"
  rm -f "$file.bak"
}

ticket_file() { # TKT-###
  local id="$1"
  [[ "$id" =~ ^TKT-[0-9]{3,}$ ]] || die "invalid ticket id '$id' (expected TKT-###)"
  local f="$TICKETS/$id.md"
  [[ -f "$f" ]] || die "ticket $id not found (expected $f)"
  echo "$f"
}

next_id() {
  local max=0
  for f in "$TICKETS"/TKT-*.md; do
    [[ -f "$f" ]] || continue
    local n
    n="$(basename "$f" | sed 's/^TKT-//; s/\.md$//')"
    [[ "$n" =~ ^[0-9]+$ ]] && [[ "$n" -gt "$max" ]] && max="$n"
  done
  printf "TKT-%03d" $((max + 1))
}

slugify() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]\+/-/g; s/^-//; s/-$//' | cut -c1-24
}

doc_commit() { # message
  git add "$TICKETS"
  git commit -q -m "$1"
  echo "  (doc commit on $(git branch --show-current))"
}

# ------------------------------------------------------------------ commands

cmd_new() {
  local title="$1" type="${2:-feature}"
  [[ "$type" == "feature" || "$type" == "bug" ]] || die "type must be feature|bug"
  local id next tmp
  id="$(next_id)"
  next="$(date +%F)"
  tmp="$(mktemp)"
  sed -e "s/^id: TKT-000$/id: $id/" \
      -e "s|^title: .*|title: \"$title\"|" \
      -e "s|^type: .*|type: $type|" \
      -e "s|^created: .*|created: $next|" \
      -e "s|^updated: .*|updated: $next|" \
      "$TICKETS/TKT-000-template.md" > "$tmp"
  mv "$tmp" "$TICKETS/$id.md"
  echo "created $id ($type): $title  → tickets/$id.md (status backlog)"
  cmd_list >/dev/null
}

cmd_start() {
  local id="$1" f
  f="$(ticket_file "$id")"
  local status
  status="$(get_field "$f" status)"
  [[ "$status" == "backlog" ]] || die "ticket $id is '$status', only backlog tickets can be started"
  git diff --quiet || die "working tree is dirty — commit or stash before starting a ticket"
  local title type branch slug db
  title="$(get_field "$f" title)"
  type="$(get_field "$f" type)"
  slug="$(slugify "$title")"
  branch="${type}-${id}-${slug}"
  db="${TEST_DB_PREFIX}${id#TKT-}"
  # 1. Flag ongoing on main (visible to all agents)
  git checkout -q main
  set_field "$f" status ongoing
  set_field "$f" assignee "$DEFAULT_ASSIGNEE"
  set_field "$f" branch "$branch"
  set_field "$f" updated "$(date +%F)"
  doc_commit "tkt: mark $id ongoing (branch $branch)"
  # 2. Create the branch
  git checkout -q -b "$branch"
  # 3. Provision the per-ticket test DB
  cmd_db_create "$id"
  echo "started $id → branch $branch | test DB $db | status ongoing"
  echo "test command: DATABASE_URL=\"$DB_URL_BASE/$db\" npx vitest run"
  echo "server port: $((3100 + ${id#TKT-}))"
}

cmd_done() {
  local id="$1" summary="${2:-}"
  [[ -n "$summary" ]] || die "usage: ticket.sh done TKT-### \"<summary of changes>\""
  local f
  f="$(ticket_file "$id")"
  local status branch prev
  status="$(get_field "$f" status)"
  [[ "$status" == "ongoing" ]] || die "ticket $id is '$status', only ongoing tickets can be finished"
  branch="$(get_field "$f" branch)"
  [[ -n "$branch" ]] || die "ticket $id has no branch — was it started?"
  git diff --quiet || die "working tree is dirty — commit or stash before finishing"
  prev="$(git branch --show-current)"
  git checkout -q main
  set_field "$f" status done
  set_field "$f" readyToMerge true
  set_field "$f" updated "$(date +%F)"
  {
    echo ""
    echo "> **done** ($(date +%F)): $summary"
  } >> "$f"
  doc_commit "tkt: $id done — ready to merge"
  git checkout -q "$prev"
  echo "marked $id done (readyToMerge=true). Branch $branch left unmerged; merge with scripts/merge-tickets.sh"
}

cmd_status() {
  local f
  f="$(ticket_file "$1")"
  sed -n '1,/^---$/p' "$f" | grep -E '^(id|title|type|status|assignee|branch|readyToMerge|created|updated):'
}

cmd_list() {
  local out
  out="| id | type | status | assignee | branch | ready | title |
|---|-----|--------|----------|--------|-------|-------|
"
  while IFS= read -r f; do
    [[ -f "$f" ]] || continue
    [[ "$(basename "$f")" == "TKT-000-template.md" ]] && continue
    local id title type status assignee branch ready
    id="$(get_field "$f" id)"
    title="$(get_field "$f" title)"
    type="$(get_field "$f" type)"
    status="$(get_field "$f" status)"
    assignee="$(get_field "$f" assignee)"
    branch="$(get_field "$f" branch)"
    ready="$(get_field "$f" readyToMerge)"
    out+="| $id | $type | $status | ${assignee:-—} | ${branch:-—} | $ready | $title |
"
  done < <(ls "$TICKETS"/TKT-*.md 2>/dev/null | sort -t- -k2 -n)
  printf '%s' "$out" > "$TICKETS/INDEX.md"
  echo "INDEX.md regenerated ($(grep -c '^| TKT-' "$TICKETS/INDEX.md" || true) tickets)"
}

cmd_db_create() {
  local id="$1" db
  ticket_file "$id" >/dev/null
  db="${TEST_DB_PREFIX}${id#TKT-}"
  if psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1; then
    echo "db $db already exists"
  else
    psql -d postgres -q -c "CREATE DATABASE $db"
    echo "created db $db"
  fi
  DATABASE_URL="$DB_URL_BASE/$db" npx prisma migrate deploy >/dev/null 2>&1
  echo "migrated db $db"
}

cmd_db_drop() {
  local id="$1" db
  ticket_file "$id" >/dev/null
  db="${TEST_DB_PREFIX}${id#TKT-}"
  psql -d postgres -q -c "DROP DATABASE IF EXISTS $db"
  echo "dropped db $db (if it existed)"
}

# ------------------------------------------------------------------ dispatch

case "${1:-}" in
  new)       [[ $# -ge 2 ]] || die "usage: ticket.sh new \"<title>\" [bug]"; cmd_new "$2" "${3:-feature}" ;;
  start)     [[ $# -eq 2 ]] || die "usage: ticket.sh start TKT-###"; cmd_start "$2" ;;
  done)      [[ $# -ge 3 ]] || die "usage: ticket.sh done TKT-### \"<summary>\""; cmd_done "$2" "$3" ;;
  status)    cmd_status "$2" ;;
  list)      cmd_list ;;
  db-create) cmd_db_create "$2" ;;
  db-drop)   cmd_db_drop "$2" ;;
  *) cat <<'EOF'
usage: scripts/ticket.sh <command> [args]

  new "<title>" [bug]       create a backlog ticket (next id)
  start TKT-###             flag ongoing, create branch, provision test DB
  done TKT-### "<summary>"  flag done + readyToMerge + append notes
  status TKT-###            print ticket frontmatter
  list                      regenerate INDEX.md
  db-create TKT-###         create + migrate per-ticket test DB
  db-drop TKT-###           drop per-ticket test DB
EOF
    ;;
esac
