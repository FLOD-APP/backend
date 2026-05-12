#!/usr/bin/env bash
# Auto-Branch Push Reminder — Stop hook
# Reminds Claude to push and create a PR if on an auto-created branch.
# NEVER blocks stopping — always exits 0.

set -uo pipefail

# Read hook input from stdin
INPUT=$(cat)

# Check stop_hook_active to prevent infinite loops
STOP_ACTIVE="$(echo "$INPUT" | python3 -c "
import json, sys
data = json.loads(sys.stdin.read())
print(str(data.get('stop_hook_active', False)).lower())
" 2>/dev/null)" || STOP_ACTIVE="false"

if [[ "$STOP_ACTIVE" == "true" ]]; then
  exit 0
fi

# Parse session_id
SESSION_ID="$(echo "$INPUT" | python3 -c "
import json, sys
data = json.loads(sys.stdin.read())
print(data.get('session_id', ''))
" 2>/dev/null)" || exit 0

[[ -z "$SESSION_ID" ]] && exit 0

# Check for marker file
MARKER="/tmp/claude-auto-branch-${SESSION_ID}"
if [[ ! -f "$MARKER" ]]; then
  exit 0
fi

BRANCH_NAME="$(cat "$MARKER" 2>/dev/null)" || exit 0
[[ -z "$BRANCH_NAME" ]] && exit 0

# Find project root
PROJECT_ROOT=""
for candidate in "$(pwd)" "/Users/ashm4/Projects/FLOD/flod_backend"; do
  if [[ -f "$candidate/package.json" ]] && [[ -d "$candidate/src" ]]; then
    PROJECT_ROOT="$candidate"
    break
  fi
done

[[ -z "$PROJECT_ROOT" ]] && exit 0
cd "$PROJECT_ROOT" || exit 0

# Check if git is available
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

# Get current branch
CURRENT="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)" || exit 0

# Only remind if we're still on the auto-created branch
if [[ "$CURRENT" != "$BRANCH_NAME" ]]; then
  rm -f "$MARKER" 2>/dev/null
  exit 0
fi

# Check if branch has unpushed commits or no remote tracking
HAS_REMOTE="$(git rev-parse --abbrev-ref "${BRANCH_NAME}@{upstream}" 2>/dev/null)" || HAS_REMOTE=""
UNPUSHED=false

if [[ -z "$HAS_REMOTE" ]]; then
  # No remote tracking at all — needs push
  UNPUSHED=true
else
  # Has remote — check for unpushed commits
  AHEAD="$(git rev-list "${BRANCH_NAME}@{upstream}..HEAD" --count 2>/dev/null)" || AHEAD="0"
  if [[ "$AHEAD" -gt 0 ]]; then
    UNPUSHED=true
  fi
fi

# Clean up marker file
rm -f "$MARKER" 2>/dev/null

if [[ "$UNPUSHED" == true ]]; then
  # Count commits on this branch (relative to main/development)
  for base in development main; do
    COMMIT_COUNT="$(git rev-list "${base}..HEAD" --count 2>/dev/null)" || continue
    if [[ "$COMMIT_COUNT" -gt 0 ]]; then
      break
    fi
  done
  COMMIT_COUNT="${COMMIT_COUNT:-0}"

  python3 -c "
import json
branch = '$BRANCH_NAME'
count = '$COMMIT_COUNT'
msg = f'Branch {branch} has {count} unpushed commit(s). Push and create a PR to merge into development:\n  git push -u origin {branch}\n  gh pr create --base development'
print(json.dumps({'systemMessage': msg}))
"
fi

exit 0
