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
    if [[ "$n" =~ ^[0-9]+$ ]]; then
      local v=$((10#$n))
      [[ "$v" -gt "$max" ]] && max="$v"
    fi
  done
  printf "TKT-%03d" $((max + 1))
}

slugify() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-//; s/-$//' | cut -c1-24 | sed -E 's/-+$//'
}

doc_commit() { # message
  git add "$TICKETS"
  git commit -q -m "$1"
  echo "  (doc commit on $(git branch --show-current))"
}

# ------------------------------------------------------------------ commands

cmd_new() {
  local title="$1" type="${2:-feature}" size="${3:-small}" group="${4:-}" severity="${5:-P2}"
  [[ "$type" == "feature" || "$type" == "bug" ]] || die "type must be feature|bug"
  [[ "$size" == "small" || "$size" == "medium" || "$size" == "big" ]] || die "size must be small|medium|big"
  [[ "$severity" == "P0" || "$severity" == "P1" || "$severity" == "P2" ]] || die "severity must be P0|P1|P2"
  local id next tmp
  id="$(next_id)"
  next="$(date +%F)"
  tmp="$(mktemp)"
  sed -e "s/^id: TKT-000$/id: $id/" \
      -e "s|^title: .*|title: \"$title\"|" \
      -e "s|^type: .*|type: $type|" \
      -e "s|^size: .*|size: $size|" \
      -e "s|^severity: .*|severity: $severity|" \
      -e "s|^group: .*|group: \"$group\"|" \
      -e "s|^created: .*|created: $next|" \
      -e "s|^updated: .*|updated: $next|" \
      "$TICKETS/TKT-000-template.md" > "$tmp"
  mv "$tmp" "$TICKETS/$id.md"
  echo "created $id ($type/$size/$severity${group:+, group '$group'}): $title  → tickets/$id.md (status backlog)"
  cmd_list >/dev/null
}

cmd_start() {
  local id="$1" f
  f="$(ticket_file "$id")"
  local status
  status="$(get_field "$f" status)"
  [[ "$status" == "backlog" ]] || die "ticket $id is '$status', only backlog tickets can be started"
  git diff --quiet || die "working tree is dirty — commit or stash before starting a ticket"
  local title type size group branch slug db join_branch
  title="$(get_field "$f" title)"
  type="$(get_field "$f" type)"
  size="$(get_field "$f" size)"
  group="$(get_field "$f" group)"
  slug="$(slugify "$title")"
  db="${TEST_DB_PREFIX}${id#TKT-}"
  # Group-aware: a ticket in a group joins an ongoing sibling's branch → one group, one branch/run.
  join_branch=""
  if [[ -n "$group" ]]; then
    for g in "$TICKETS"/TKT-*.md; do
      [[ -f "$g" ]] || continue
      [[ "$(basename "$g")" == "TKT-000-template.md" || "$g" == "$f" ]] && continue
      [[ "$(get_field "$g" group)" == "$group" && "$(get_field "$g" status)" == "ongoing" ]] || continue
      join_branch="$(get_field "$g" branch)"
      break
    done
  fi
  if [[ -n "$join_branch" ]]; then
    branch="$join_branch"
    echo "group '$group': joining ongoing sibling branch $branch (one group = one branch)"
  else
    branch="${type}-${id}-${slug}"
  fi
  # 1. Flag ongoing on main (visible to all agents)
  git checkout -q main
  set_field "$f" status ongoing
  set_field "$f" assignee "$DEFAULT_ASSIGNEE"
  set_field "$f" branch "$branch"
  set_field "$f" updated "$(date +%F)"
  # Regenerate INDEX.md so agents reading it see the assignment immediately
  # (a stale index showing backlog invites another agent to grab the ticket).
  cmd_list >/dev/null
  doc_commit "tkt: mark $id ongoing (branch $branch)"
  # 2. Create the branch (or join the group's ongoing branch)
  if [[ -n "$join_branch" ]]; then
    git checkout -q "$branch"
  else
    git checkout -q -b "$branch"
  fi
  # 3. Provision the per-ticket test DB
  cmd_db_create "$id"
  echo "started $id → branch $branch | test DB $db | status ongoing"
  echo "test command: DATABASE_URL=\"$DB_URL_BASE/$db\" npx vitest run"
  # Leading zeros parse as octal in bash arithmetic ("018" → error) — force base 10.
  echo "server port: $((3100 + 10#${id#TKT-}))"
}

cmd_done() {
  local id="$1" summary="${2:-}"
  [[ -n "$summary" ]] || die "usage: ticket.sh done TKT-### \"<summary of changes>\" [--force]"
  local f status branch prev unchecked placeholder force=0
  [[ "${3:-}" == "--force" ]] && force=1
  git diff --quiet || die "working tree is dirty — commit or stash before finishing"
  # Status lives on main — read and update it there (branch copies go stale).
  prev="$(git branch --show-current)"
  git checkout -q main
  f="$(ticket_file "$id")"
  status="$(get_field "$f" status)"
  [[ "$status" == "ongoing" ]] || die "ticket $id is '$status', only ongoing tickets can be finished"
  branch="$(get_field "$f" branch)"
  [[ -n "$branch" ]] || die "ticket $id has no branch — was it started?"

  # Acceptance-criteria gate: the spec must be ticked (verified) before done.
  # Auto-ticking would let agents claim verification they never performed, so
  # the script requires the boxes to be checked manually. --force bypasses for
  # genuinely N/A criteria.
  unchecked="$(grep -c '^\s*- \[ \]' "$f" || true)"
  placeholder="$(grep -c 'concrete, testable criteria' "$f" || true)"
  if [[ "$placeholder" -gt 0 || "$unchecked" -gt 0 ]]; then
    if [[ $force -eq 0 ]]; then
      echo "ERROR: $id has $unchecked unchecked acceptance-criteria box(es) (or template placeholders)." >&2
      echo "       Edit tickets/$id.md: replace placeholders with concrete criteria and" >&2
      echo "       tick each [ ] you have verified, then re-run done." >&2
      echo "       Pass --force only if the criteria are genuinely not applicable." >&2
      die "acceptance criteria not verified"
    fi
    echo "WARNING: marking done with unchecked criteria (--force)."
  fi

  set_field "$f" status done
  set_field "$f" readyToMerge true
  set_field "$f" updated "$(date +%F)"
  {
    echo ""
    echo "> **done** ($(date +%F)): $summary"
  } >> "$f"
  # Regenerate INDEX.md so agents reading it see done immediately.
  cmd_list >/dev/null
  doc_commit "tkt: $id done — ready to merge"
  git checkout -q "$prev"
  echo "marked $id done (readyToMerge=true). Branch $branch left unmerged; merge with scripts/merge-tickets.sh"
}

cmd_status() {
  local f
  f="$(ticket_file "$1")"
  sed -n '1,/^---$/p' "$f" | grep -E '^(id|title|type|size|severity|group|status|assignee|branch|readyToMerge|created|updated):'
}

cmd_list() {
  local out rows
  out="| id | type | size | sev | group | status | assignee | branch | ready | title |
|---|-----|------|-----|-------|--------|----------|--------|-------|-------|
"
  rows=""
  while IFS= read -r f; do
    [[ -f "$f" ]] || continue
    [[ "$(basename "$f")" == "TKT-000-template.md" ]] && continue
    local id title type size severity group status assignee branch ready srank rank
    id="$(get_field "$f" id)"
    title="$(get_field "$f" title)"
    type="$(get_field "$f" type)"
    size="$(get_field "$f" size)"
    severity="$(get_field "$f" severity)"
    group="$(get_field "$f" group)"
    status="$(get_field "$f" status)"
    assignee="$(get_field "$f" assignee)"
    branch="$(get_field "$f" branch)"
    ready="$(get_field "$f" readyToMerge)"
    case "${severity:-P2}" in
      P0) srank=0 ;;
      P1) srank=1 ;;
      *) srank=2 ;;
    esac
    case "${size:-small}" in
      big) rank=0 ;;
      medium) rank=1 ;;
      *) rank=2 ;;
    esac
    rows+="${srank}|${rank}|${group:-—}|$id|$type|${size:-—}|${severity:-—}|${group:-—}|$status|${assignee:-—}|${branch:-—}|$ready|$title\n"
  done < <(ls "$TICKETS"/TKT-*.md 2>/dev/null | sort -t- -k2 -n)
  # Sort by severity (P0 → P1 → P2), then size (big → medium → small),
  # then group, then id.
  rows="$(printf '%b' "$rows" | sort -t'|' -k1,1n -k2,2n -k3,3 -k4,4n)"
  while IFS='|' read -r _ _ _ id type size severity group status assignee branch ready title; do
    out+="| $id | $type | $size | $severity | $group | $status | $assignee | $branch | $ready | $title |
"
  done <<< "$rows"
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
  new)       [[ $# -ge 2 ]] || die "usage: ticket.sh new \"<title>\" [bug] [size] [group] [severity]"; cmd_new "$2" "${3:-feature}" "${4:-small}" "${5:-}" "${6:-P2}" ;;
  start)     [[ $# -eq 2 ]] || die "usage: ticket.sh start TKT-###"; cmd_start "$2" ;;
  done)      [[ $# -ge 3 ]] || die "usage: ticket.sh done TKT-### \"<summary>\""; cmd_done "$2" "$3" ;;
  status)    cmd_status "$2" ;;
  list)      cmd_list ;;
  db-create) cmd_db_create "$2" ;;
  db-drop)   cmd_db_drop "$2" ;;
  *) cat <<'EOF'
usage: scripts/ticket.sh <command> [args]

  new "<title>" [bug] [size] [group] [severity]
                            create a backlog ticket (next id); size small|medium|big,
                            severity P0|P1|P2 (default P2), group joins a shared branch
  start TKT-###             flag ongoing, create branch, provision test DB
  done TKT-### "<summary>"  flag done + readyToMerge + append notes
  status TKT-###            print ticket frontmatter
  list                      regenerate INDEX.md
  db-create TKT-###         create + migrate per-ticket test DB
  db-drop TKT-###           drop per-ticket test DB
EOF
    ;;
esac
