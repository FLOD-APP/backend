#!/usr/bin/env bash
# Auto-Branch — PreToolUse hook
# Auto-creates a feature branch on first edit of each session.
# Prevents edits on protected branches (main/development) and
# prevents cross-contamination of pre-existing feature branches.
# Exit 0 = allow (always), outputs systemMessage JSON when branching.

set -uo pipefail

# Read hook input from stdin
INPUT=$(cat)

# Parse session_id, tool_name, file_path using python3
PARSED="$(echo "$INPUT" | python3 -c "
import json, sys
data = json.loads(sys.stdin.read())
sid = data.get('session_id', '')
tn = data.get('tool_name', '')
ti = data.get('tool_input', {})
fp = ti.get('file_path', ti.get('filePath', ''))
print(sid)
print(tn)
print(fp)
" 2>/dev/null)" || exit 0

SESSION_ID="$(echo "$PARSED" | sed -n '1p')"
TOOL_NAME="$(echo "$PARSED" | sed -n '2p')"
FILE_PATH="$(echo "$PARSED" | sed -n '3p')"

# Only process Edit/Write tools
case "$TOOL_NAME" in
  Edit|Write) ;;
  *) exit 0 ;;
esac

# No session ID or file path → allow
[[ -z "$SESSION_ID" ]] && exit 0
[[ -z "$FILE_PATH" ]] && exit 0

# Check marker file — if exists, this session already branched
MARKER="/tmp/claude-auto-branch-${SESSION_ID}"
if [[ -f "$MARKER" ]]; then
  exit 0
fi

# Find project root (walk up from file path)
PROJECT_ROOT=""
check_dir="$FILE_PATH"
while [[ "$check_dir" != "/" ]]; do
  check_dir="$(dirname "$check_dir")"
  if [[ -f "$check_dir/package.json" ]] && [[ -d "$check_dir/src" ]]; then
    PROJECT_ROOT="$check_dir"
    break
  fi
done

# Fallback: try cwd or known location
if [[ -z "$PROJECT_ROOT" ]]; then
  for candidate in "$(pwd)" "/Users/ashm4/Projects/FLOD/flod_backend"; do
    if [[ -f "$candidate/package.json" ]] && [[ -d "$candidate/src" ]]; then
      PROJECT_ROOT="$candidate"
      break
    fi
  done
fi

[[ -z "$PROJECT_ROOT" ]] && exit 0

cd "$PROJECT_ROOT" || exit 0

# Check if git is available
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

# Get current branch
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)" || exit 0

# --- Derive branch name from file path ---

REL_PATH="${FILE_PATH#$PROJECT_ROOT/}"
DATE_SUFFIX="$(date +%m%d)"

# Determine prefix based on file path pattern
PREFIX="feature/edit"
case "$REL_PATH" in
  src/routes/*)          PREFIX="feature/routes" ;;
  src/services/*)        PREFIX="feature/service" ;;
  src/middleware/*)       PREFIX="feature/middleware" ;;
  src/validators/*)      PREFIX="feature/validator" ;;
  src/utils/*)           PREFIX="feature/util" ;;
  src/db/schema*)        PREFIX="feature/schema" ;;
  src/db/seed*)          PREFIX="feature/seed" ;;
  src/db/migrate*)       PREFIX="feature/migration" ;;
  src/db/*)              PREFIX="feature/db" ;;
  src/types/*)           PREFIX="feature/types" ;;
  tests/integration/*)   PREFIX="test/integration" ;;
  tests/unit/*)          PREFIX="test/unit" ;;
  tests/*)               PREFIX="test" ;;
  .claude/*)             PREFIX="chore/claude" ;;
  .github/*)             PREFIX="chore/ci" ;;
  .walden/*)             PREFIX="docs/walden" ;;
  DOCS/*)                PREFIX="docs" ;;
esac

# Override prefix for test files regardless of location
case "$REL_PATH" in
  *.test.*) PREFIX="test" ;;
esac

# Derive stem from filename: strip extensions, PascalCase/camelCase → kebab-case
BASENAME="$(basename "$FILE_PATH")"
STEM="${BASENAME%%.*}"

# Convert PascalCase/camelCase to kebab-case
STEM="$(echo "$STEM" | python3 -c "
import re, sys
s = sys.stdin.read().strip()
# Insert hyphen before uppercase letters that follow lowercase letters or digits
s = re.sub(r'([a-z0-9])([A-Z])', r'\1-\2', s)
# Insert hyphen between consecutive uppercase followed by lowercase
s = re.sub(r'([A-Z]+)([A-Z][a-z])', r'\1-\2', s)
# Replace underscores and spaces with hyphens
s = re.sub(r'[_\s]+', '-', s)
print(s.lower())
" 2>/dev/null)" || STEM="misc"

# Build branch name
BRANCH_NAME="${PREFIX}-${STEM}-${DATE_SUFFIX}"

# Truncate to 63 chars (git branch name limit)
BRANCH_NAME="${BRANCH_NAME:0:63}"

# Handle branch name collision — append -2, -3, etc.
FINAL_BRANCH="$BRANCH_NAME"
if git show-ref --verify --quiet "refs/heads/$FINAL_BRANCH" 2>/dev/null; then
  for i in 2 3 4 5; do
    CANDIDATE="${BRANCH_NAME}-${i}"
    CANDIDATE="${CANDIDATE:0:63}"
    if ! git show-ref --verify --quiet "refs/heads/$CANDIDATE" 2>/dev/null; then
      FINAL_BRANCH="$CANDIDATE"
      break
    fi
    # If all collisions exhausted, warn but fail-open
    if [[ $i -eq 5 ]]; then
      echo "$CURRENT_BRANCH" > "$MARKER"
      python3 -c "
import json
msg = 'Auto-branch: all branch name variants for $BRANCH_NAME are taken. Continuing on $CURRENT_BRANCH — manually create a feature branch.'
print(json.dumps({'systemMessage': msg}))
"
      exit 0
    fi
  done
fi

# --- Create the branch ---

# Stash dirty working tree if needed
STASHED=false
if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
  git stash push -m "auto-branch: pre-branch stash for $FINAL_BRANCH" 2>/dev/null && STASHED=true
fi

# Create and switch to the new branch
if ! git checkout -b "$FINAL_BRANCH" 2>/dev/null; then
  # Branch creation failed — pop stash if we stashed, fail-open
  if [[ "$STASHED" == true ]]; then
    git stash pop 2>/dev/null || true
  fi
  echo "$CURRENT_BRANCH" > "$MARKER"
  exit 0
fi

# Pop stash if we stashed
if [[ "$STASHED" == true ]]; then
  git stash pop 2>/dev/null || true
fi

# Write marker file with branch name
echo "$FINAL_BRANCH" > "$MARKER"

# Output systemMessage for Claude
python3 -c "
import json
branch = '$FINAL_BRANCH'
protected = '$CURRENT_BRANCH'
msg = f'Auto-branched: created {branch} from {protected}. All edits this session will be on this branch. Remember to push and create a PR when done.'
print(json.dumps({'systemMessage': msg}))
"

exit 0
