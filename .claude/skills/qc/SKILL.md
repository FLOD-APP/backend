---
name: qc
description: >
  QC & TDD enforcement. Generates test scaffolds from Walden specs,
  reviews test coverage gaps, and gates implementation on test-first discipline.
argument-hint: "<spec-name> | review | check"
allowed-tools: "Read Glob Grep Bash(npx jest *) Bash(npx tsc *) Write Edit"
user-invocable: true
---

# /qc — Quality Control & TDD Enforcement

You are the FLOD backend's quality controller. Your job is to enforce test-first development by scaffolding tests from Walden specs, reviewing coverage, and gating implementation.

## Argument Routing

Parse the argument after `/qc`:
- **No argument or `review`** → Mode 2: Review
- **`check`** → Mode 3: Check
- **Anything else** → Mode 1: Scaffold (treat argument as a spec name)

---

## Mode 1: Scaffold (`/qc <spec-name>`)

Generate test files from a Walden spec so the developer starts in RED state.

### Step 1 — Read the spec

Read these files:
- `.walden/specs/<spec-name>/requirements.md` → Extract all requirement IDs matching `R\d+\.AC\d+` with their EARS text
- `.walden/specs/<spec-name>/design.md` → Extract: Requirement Coverage table, Testing Strategy section, Service interfaces, Data Models
- `.walden/specs/<spec-name>/tasks.md` → Extract task-to-requirement mappings

If the spec doesn't exist, list available specs from `.walden/specs/` and ask the user to choose.

### Step 2 — Map ACs to test layers

For each acceptance criterion, determine which component implements it (from the design doc's Requirement Coverage table), then map to the test layer based on the source path:

| Source path pattern | Test layer | Test location | Example |
|---|---|---|---|
| `src/utils/` | Unit | `tests/unit/<name>.test.ts` | `tests/unit/vat.test.ts` |
| `src/middleware/` | Unit | `tests/unit/<name>.test.ts` | `tests/unit/validate.test.ts` |
| `src/services/` | Integration | `tests/integration/<name>.test.ts` | `tests/integration/auth.test.ts` |
| `src/routes/` | Integration | `tests/integration/<name>.test.ts` | `tests/integration/branches.test.ts` |
| `src/validators/` | Unit | `tests/unit/<name>.test.ts` | `tests/unit/auth.validators.test.ts` |

### Step 3 — Generate test files

For each implementing component that needs tests, create a test file following these rules:

1. **Traceability comments**: Above each `it()` block, add `// R1.AC1: <paraphrased acceptance criterion>`
2. **Real assertions**: Write actual `expect()` calls derived from the EARS requirement text — never use `it.todo()` or placeholder assertions
3. **Imports of modules that don't exist yet**: Import from the source path even if the module hasn't been created. This ensures tests fail (RED state)
4. **Correct test patterns per layer**:
   - **Unit tests**: Direct import, assert return values, test edge cases
   - **Integration tests**: Use supertest against the Express app with real PostgreSQL database
   - **Service tests**: Call service functions directly, verify DB state
5. **Test setup patterns**:
   - Integration: import `createApp`, create supertest agent, share DB connection
   - Unit: direct import, no DB needed
   - Cleanup: dependency-ordered deletes in `afterAll`
6. **File location**: `tests/unit/<name>.test.ts` or `tests/integration/<name>.test.ts`

### Step 4 — Verify RED state

After generating each test file, run it:
```bash
npx jest <path-to-test> --no-cache --no-coverage
```

Confirm it fails (RED). If it passes, the test is not testing new behavior — flag this.

### Step 5 — Output traceability matrix

Print a markdown table mapping every AC to its test:

```
| AC     | Test File                           | it() block description      |
|--------|-------------------------------------|-----------------------------|
| R1.AC1 | tests/unit/vat.test.ts              | calculates VAT-inclusive price |
| R2.AC1 | tests/integration/auth.test.ts      | returns JWT on valid OTP     |
```

Report any ACs that could NOT be mapped to a test (e.g., infrastructure-only requirements).

---

## Mode 2: Review (`/qc review`)

Audit the entire codebase's test health.

### Step 1 — Test-to-source ratio

1. Glob `src/**/*.ts` — exclude files matching:
   - `src/types/**`
   - `src/db/schema.ts`, `src/db/seed.ts`, `src/db/migrate.ts`, `src/db/connection.ts`
   - `src/index.ts`, `src/app.ts`
   - `**/*.d.ts`

2. For each source file, check if a corresponding test exists at:
   - `tests/unit/<stem>.test.ts`
   - `tests/integration/<stem>.test.ts`
   - Also check domain stem (e.g., `auth.service.ts` → `auth.test.ts`)

3. Report files WITH and WITHOUT tests, grouped by source directory:
   ```
   ## src/services/ — 10/12 covered (83%)
   ✓ auth.service.ts → tests/integration/auth.test.ts
   ✗ newFeature.service.ts ← MISSING TEST
   ```

### Step 2 — AC coverage

For each approved Walden spec (has `tasks.md`):
1. Extract all `R\d+\.AC\d+` IDs from `requirements.md`
2. Grep all test files for `// R\d+\.AC\d+` traceability comments
3. Report which ACs have test coverage and which don't

### Step 3 — Anti-patterns

Grep test files for common issues:
- `it()` blocks with no `expect()` call
- `jest.fn()` that is never asserted
- Tests with `it.skip` or `xit`
- Empty `it()` blocks
- `console.log` in test files (should use proper assertions)
- Missing `afterAll` cleanup in integration tests
- Mocked DB queries in integration tests (should use real DB)

### Step 4 — Domain summary

Group results by business domain and output a summary table:

```
| Domain       | Source files | Test files | Coverage % | AC coverage |
|-------------|-------------|-----------|-----------|-------------|
| auth        | 4           | 1         | 25%       | 8/8 (100%)  |
| pricing     | 3           | 2         | 67%       | 5/5 (100%)  |
```

---

## Mode 3: Check (`/qc check`)

Pre-flight check before implementing a specific task.

### Step 1 — Identify context

Determine the current spec/task from:
1. Explicit argument (e.g., `/qc check flod-backend T3`)
2. Conversation context (what spec/task has the user been working on?)
3. If unclear, ask the user

### Step 2 — Extract requirements

From `.walden/specs/<spec>/tasks.md`, find the task and its linked requirement IDs.

### Step 3 — Verify test readiness

For each requirement ID linked to the task:
1. Find the implementing component (from `design.md` Requirement Coverage table)
2. Check if a test file exists for that component
3. Check if the test file contains the specific `// R\d+.AC\d+` traceability comment
4. If test exists, run it to verify it's in RED state (failing)

### Step 4 — Verdict

Output one of:

**PASS — Ready to implement:**
```
✓ All required tests exist and are in RED state
✓ R1.AC1 → tests/integration/pricing.test.ts (FAILING)
Proceed with implementation.
```

**FAIL — Missing tests:**
```
✗ Missing tests for this task:
  - R2.AC1 → needs test for src/services/wallet.service.ts
Run `/qc <spec-name>` to scaffold tests, or create them manually.
```

---

## Conventions

- **Never generate `it.todo()` blocks** — every test must have real assertions
- **Never skip the RED verification** — if a generated test passes, it's not testing new behavior
- **Always use traceability comments** — `// R1.AC1: <description>` above every `it()` block
- **Match existing project patterns** — read 2-3 existing test files before generating new ones to match style
- **Integration tests use real DB** — never mock Drizzle queries in integration tests
- **Supertest for HTTP tests** — use `request(app).get('/api/v1/...')` pattern
- **Cleanup in afterAll** — dependency-ordered deletes, leaf tables first
