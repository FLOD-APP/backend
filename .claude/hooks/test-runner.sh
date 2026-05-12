#!/usr/bin/env bash
# Test Runner — PostToolUse hook
# Auto-runs jest on test files after they're edited.
# Outputs JSON with systemMessage for Claude's context.

set -uo pipefail

# Read hook input from stdin
INPUT=$(cat)

# Parse file_path using python3
FILE_PATH="$(echo "$INPUT" | python3 -c "
import json, sys
data = json.loads(sys.stdin.read())
ti = data.get('tool_input', {})
fp = ti.get('file_path', ti.get('filePath', ''))
print(fp)
" 2>/dev/null)" || exit 0

# No file path → skip
[[ -z "$FILE_PATH" ]] && exit 0

# Only trigger for test files
case "$FILE_PATH" in
  *.test.*) ;;
  *) exit 0 ;;
esac

# Find project root
PROJECT_ROOT=""
check_dir="$FILE_PATH"
while [[ "$check_dir" != "/" ]]; do
  check_dir="$(dirname "$check_dir")"
  if [[ -f "$check_dir/package.json" ]] && [[ -d "$check_dir/src" ]]; then
    PROJECT_ROOT="$check_dir"
    break
  fi
done

[[ -z "$PROJECT_ROOT" ]] && exit 0

REL_PATH="${FILE_PATH#$PROJECT_ROOT/}"

# Run jest on the specific test file
JEST_OUTPUT=$(cd "$PROJECT_ROOT" && npx jest "$REL_PATH" --no-cache --no-coverage 2>&1) || true
JEST_EXIT=$?

# Extract the summary line (e.g., "Tests: 5 passed, 5 total")
SUMMARY=$(echo "$JEST_OUTPUT" | grep -E "^Tests:" | tail -1)
SUITES=$(echo "$JEST_OUTPUT" | grep -E "^Test Suites:" | tail -1)

# Determine status
if [[ $JEST_EXIT -eq 0 ]]; then
  STATUS="PASSED"
else
  STATUS="FAILED"
fi

# Get last 20 lines for context
TAIL=$(echo "$JEST_OUTPUT" | tail -20)

# Build the systemMessage JSON safely using python3
python3 -c "
import json, sys

status = '$STATUS'
rel_path = '''$REL_PATH'''
suites = '''$SUITES'''
summary = '''$SUMMARY'''
tail = sys.stdin.read()

msg = f'Test Runner [{status}]: {rel_path}\n{suites}\n{summary}\n\n--- Output (last 20 lines) ---\n{tail}'
print(json.dumps({'systemMessage': msg}))
" <<< "$TAIL"
