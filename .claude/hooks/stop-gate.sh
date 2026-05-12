#!/usr/bin/env bash
# Stop Gate — Stop hook
# Blocks session completion if jest, tsc, or prettier fail.
# Exit 0 = allow stop, Exit 2 = block stop (message on stderr)

set -uo pipefail

# Read hook input from stdin
INPUT=$(cat)

# Prevent infinite loops — if Claude is already retrying from a Stop block, let it stop
STOP_ACTIVE="$(echo "$INPUT" | python3 -c "
import json, sys
data = json.loads(sys.stdin.read())
print(str(data.get('stop_hook_active', False)).lower())
" 2>/dev/null)" || STOP_ACTIVE="false"

if [[ "$STOP_ACTIVE" == "true" ]]; then
  exit 0
fi

# Find project root from cwd or common location
PROJECT_ROOT=""
for candidate in "$(pwd)" "/Users/ashm4/Projects/FLOD/flod_backend"; do
  if [[ -f "$candidate/package.json" ]] && [[ -d "$candidate/src" ]]; then
    PROJECT_ROOT="$candidate"
    break
  fi
done

if [[ -z "$PROJECT_ROOT" ]]; then
  # Can't find project root — don't block
  exit 0
fi

cd "$PROJECT_ROOT"

BLOCKED=false
BLOCK_MSG=""

# --- Run Jest ---
JEST_OUTPUT=$(npx jest --no-cache --no-coverage --bail 2>&1) || true
JEST_EXIT=${PIPESTATUS[0]:-$?}

if [[ $JEST_EXIT -ne 0 ]]; then
  BLOCKED=true
  # Extract failing test files
  FAILING_FILES=$(echo "$JEST_OUTPUT" | grep -E "^  ●|FAIL " | head -10)
  # Get failure details (first 50 lines of failure output)
  FAILURE_DETAILS=$(echo "$JEST_OUTPUT" | tail -50)

  BLOCK_MSG+="JEST FAILED — tests must pass before stopping.\n"
  BLOCK_MSG+="\n$FAILING_FILES\n"
  BLOCK_MSG+="\n--- Failure details (last 50 lines) ---\n"
  BLOCK_MSG+="$FAILURE_DETAILS\n"
fi

# --- Run TypeScript ---
TSC_OUTPUT=$(npx tsc --noEmit 2>&1) || true
TSC_EXIT=${PIPESTATUS[0]:-$?}

if [[ $TSC_EXIT -ne 0 ]]; then
  BLOCKED=true
  # Get type errors (last 30 lines)
  TSC_ERRORS=$(echo "$TSC_OUTPUT" | tail -30)

  BLOCK_MSG+="\nTSC FAILED — type errors must be resolved before stopping.\n"
  BLOCK_MSG+="\n--- Type errors (last 30 lines) ---\n"
  BLOCK_MSG+="$TSC_ERRORS\n"
fi

# --- Run Prettier ---
PRETTIER_OUTPUT=$(npx prettier --check src/ tests/ 2>&1) || true
PRETTIER_EXIT=${PIPESTATUS[0]:-$?}

if [[ $PRETTIER_EXIT -ne 0 ]]; then
  BLOCKED=true
  # Extract unformatted files
  UNFORMATTED=$(echo "$PRETTIER_OUTPUT" | grep -E "^\[warn\]" | grep -v "Code style issues" | head -20)

  BLOCK_MSG+="\nPRETTIER FAILED — formatting issues must be fixed before stopping.\n"
  BLOCK_MSG+="\n$UNFORMATTED\n"
  BLOCK_MSG+="\nRun: npx prettier --write src/ tests/ to fix.\n"
fi

# --- Verdict ---
if [[ "$BLOCKED" == true ]]; then
  echo -e "STOP BLOCKED — quality gates failed.\n" >&2
  echo -e "$BLOCK_MSG" >&2
  exit 2
fi

exit 0
