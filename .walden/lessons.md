# Walden Lessons

Review this file before non-trivial work. Scan the category matching your current task for past mistakes, corrections, and guardrails.

> **Rule:** After any correction, rejection, failed validation, or surprising discovery during Walden phases or general development, append a lesson below. Use format: `### YYYY-MM-DDTHH:MM:SSZ | source | phase` with Trigger / Lesson / Guardrail fields.

---

## Backend / Architecture

### 2026-05-12T14:00:00Z | jwt-refresh-rotation | execute
- Trigger: JWT refresh token rotation produced duplicate tokens when rotation happened within the same second — `jwt.sign()` with identical payload + identical `iat` produces identical output.
- Lesson: Refresh tokens MUST include a unique `jti: randomUUID()` claim to prevent duplicate hash collision. Without it, the old revoked token and new token have the same hash, causing immediate revocation of the "new" token.
- Guardrail: Always include `jti: randomUUID()` when signing refresh tokens. Never rely on `iat` alone for uniqueness.

### 2026-05-12T14:01:00Z | vat-rounding | execute
- Trigger: VAT round-trip calculation loses a penny: SAR 12 → 12/1.15 = 10.4347... → truncated to 10.43 → 10.43 × 1.15 = 11.9945 → rounds to SAR 11.99 (not 12.00).
- Lesson: Extracting VAT from an inclusive price and reapplying it causes rounding drift. The penny loss compounds across large orders.
- Guardrail: Use consistent `ROUND(value, 2)` at every step. For discount calculations: `ex_vat = ROUND(price / 1.15, 2)`, `discounted = ROUND(ex_vat * (1 - rate), 2)`, `final = ROUND(discounted * 1.15, 2)`. Accept that 1 halala drift may occur and document it.

### 2026-05-12T14:02:00Z | drizzle-transaction-types | execute
- Trigger: Drizzle's `PgTransaction` type is NOT the same as `PostgresJsDatabase`. Passing a transaction to a function typed as `PostgresJsDatabase` causes TypeScript errors.
- Lesson: When writing service functions that need to work inside transactions, use `Pick<Db, 'select' | 'insert' | 'update' | 'delete'>` or a custom `DbOrTx` type that accepts both.
- Guardrail: Define a `DbOrTx` type alias in `src/types/` that unions `PostgresJsDatabase` and `PgTransaction`. Use this for all service function parameters that accept either.

---

## Database / ORM

### 2026-05-12T14:03:00Z | seed-dependency-order | execute
- Trigger: Seed script failed with foreign key constraint violations when tables were seeded in arbitrary order.
- Lesson: Seed data must be inserted in dependency order — parent tables before child tables. Delete in reverse order during test cleanup.
- Guardrail: Seed order: product_categories → products → product_prices → packages → package_meals → rotations → rotation_items → swap_options → branches → discounts → settings. Cleanup reverses this order.

---

## Testing

### 2026-05-12T14:04:00Z | integration-test-isolation | execute
- Trigger: Integration tests that created users/subscriptions left data behind, causing subsequent test suites to fail with unique constraint violations.
- Lesson: Each integration test suite must clean up its own data in `afterAll`. Use dependency-ordered deletes (leaf tables first) within a transaction.
- Guardrail: Every integration test file must have an `afterAll` block that deletes test data in reverse FK order. Use unique identifiers (e.g., test phone numbers starting with `+966500000`) to avoid collision with seed data.

---

## DevOps / Infrastructure

### 2026-05-12T14:05:00Z | eslint-v10-flat-config | execute
- Trigger: ESLint v10 does not support `.eslintrc.*` files or the `--ext` flag. Running `eslint --ext .ts src/` fails with "Unknown option '--ext'".
- Lesson: ESLint v10 requires flat config format (`eslint.config.mjs`). Plugins are imported as ES modules and passed as objects to the `plugins` property. The `recommended` config is spread from the plugin, not extended via `extends`.
- Guardrail: Use `eslint.config.mjs` with `export default [...]` array format. Import `@typescript-eslint/eslint-plugin` and `@typescript-eslint/parser` as ES modules. Never use `--ext` flag.

### 2026-05-12T14:06:00Z | zod-v4-safe-parse | execute
- Trigger: Zod v4 changed `safeParse` return shape. The `success` property is now a discriminated union — `{ success: true, data }` or `{ success: false, error }`.
- Lesson: Generic validation middleware must check `result.success` before accessing `result.data`. The `error` property is only available when `success` is `false`.
- Guardrail: Always use the pattern: `const result = schema.safeParse(data); if (!result.success) { return res.status(400).json({ error: result.error }); }`. Never destructure without checking `success` first.

---

## Process / Workflow

(No entries yet — append lessons here as they occur)
