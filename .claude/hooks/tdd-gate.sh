#!/usr/bin/env bash
# TDD Gate — PreToolUse hook
# Blocks Edit/Write on source files that lack a corresponding test file.
# Exit 0 = allow, Exit 2 = block (message on stderr)

set -euo pipefail

# Read hook input from stdin
INPUT=$(cat)

# Parse tool_name and file_path using python3 (ships with macOS)
PARSED="$(echo "$INPUT" | python3 -c "
import json, sys
data = json.loads(sys.stdin.read())
ti = data.get('tool_input', {})
fp = ti.get('file_path', ti.get('filePath', ''))
tn = data.get('tool_name', '')
print(tn)
print(fp)
" 2>/dev/null)" || exit 0

TOOL_NAME="$(echo "$PARSED" | sed -n '1p')"
FILE_PATH="$(echo "$PARSED" | sed -n '2p')"

# Only process Edit/Write tools
case "$TOOL_NAME" in
  Edit|Write) ;;
  *) exit 0 ;;
esac

# No file path → allow (shouldn't happen, but be safe)
[[ -z "$FILE_PATH" ]] && exit 0

# Find project root (walk up looking for package.json with src/)
PROJECT_ROOT=""
check_dir="$FILE_PATH"
while [[ "$check_dir" != "/" ]]; do
  check_dir="$(dirname "$check_dir")"
  if [[ -f "$check_dir/package.json" ]] && [[ -d "$check_dir/src" ]]; then
    PROJECT_ROOT="$check_dir"
    break
  fi
done

# If we can't find project root, allow
[[ -z "$PROJECT_ROOT" ]] && exit 0

# Make path relative to project root
REL_PATH="${FILE_PATH#$PROJECT_ROOT/}"

# --- Exemptions: allow immediately ---

# Must be under src/ to be gated
[[ "$REL_PATH" != src/* ]] && exit 0

# Is itself a test file → allow
[[ "$REL_PATH" == *.test.* ]] && exit 0

# Non-behavioral directories → allow
[[ "$REL_PATH" == src/types/* ]] && exit 0
[[ "$REL_PATH" == src/db/schema.ts ]] && exit 0
[[ "$REL_PATH" == src/db/seed.ts ]] && exit 0
[[ "$REL_PATH" == src/db/migrate.ts ]] && exit 0
[[ "$REL_PATH" == src/db/connection.ts ]] && exit 0

# Non-behavioral file types → allow
[[ "$REL_PATH" == *.d.ts ]] && exit 0

# Non-code project files → allow
[[ "$REL_PATH" == *.md ]] && exit 0
[[ "$REL_PATH" == *.json ]] && exit 0
[[ "$REL_PATH" == *.js ]] && exit 0
[[ "$REL_PATH" == *.mjs ]] && exit 0

# Config files → allow
[[ "$REL_PATH" == src/index.ts ]] && exit 0
[[ "$REL_PATH" == src/app.ts ]] && exit 0

# --- Check for corresponding test file ---

# Extract filename stem
BASENAME="$(basename "$FILE_PATH")"
STEM="${BASENAME%%.*}"

# Determine expected test location based on source type
# src/utils/<name>.ts → tests/unit/<name>.test.ts
# src/middleware/<name>.ts → tests/unit/<name>.test.ts
# src/services/<name>.ts → tests/integration/<name>.test.ts
# src/routes/<name>.ts → tests/integration/<name>.test.ts
# src/validators/<name>.ts → tests/unit/<name>.test.ts (or integration)

TESTS_DIR="$PROJECT_ROOT/tests"

# Check unit tests
if [[ -f "$TESTS_DIR/unit/${STEM}.test.ts" ]]; then
  exit 0
fi

# Check integration tests
if [[ -f "$TESTS_DIR/integration/${STEM}.test.ts" ]]; then
  exit 0
fi

# Also check with common naming variants
# e.g., auth.service.ts → auth.test.ts
DOMAIN_STEM="${STEM%%.*}"
if [[ "$DOMAIN_STEM" != "$STEM" ]]; then
  if [[ -f "$TESTS_DIR/unit/${DOMAIN_STEM}.test.ts" ]] || \
     [[ -f "$TESTS_DIR/integration/${DOMAIN_STEM}.test.ts" ]]; then
    exit 0
  fi
fi

# No test found → block with TDD violation message
echo "TDD violation: write tests first for $REL_PATH" >&2
echo "" >&2
echo "Expected test at one of:" >&2
echo "  tests/unit/${STEM}.test.ts" >&2
echo "  tests/integration/${STEM}.test.ts" >&2
echo "" >&2
echo "Run /qc <spec-name> to scaffold tests from a Walden spec," >&2
echo "or create the test file manually before editing the source." >&2
exit 2
