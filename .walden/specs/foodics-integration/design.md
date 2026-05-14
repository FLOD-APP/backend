---
status: approved
approved_at: 2026-05-14T10:05:00Z
last_modified: 2026-05-14T10:05:00Z
source_requirements_approved_at: 2026-05-14T10:00:00Z
---

# Feature Design

## Overview

Build the Foodics POS API v5 integration module for the FLOD backend. This is a greenfield integration -- Ferotech never connected the Foodics API. The module handles order creation, retry queue management, and sync monitoring. All code is written now (Phase 0); sandbox and production testing happen in Phases 1-2 after API keys are obtained from Abu Talin.

**Key design decision:** Foodics sync is **eventual, not transactional**. FLOD's database is the source of truth. A failed Foodics sync does NOT block or roll back meal collection. The sync service queues failures for exponential-backoff retry.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  FLOD Backend                                               │
│                                                             │
│  CollectionService.collectMeal()                            │
│          │ (Phase 2: after DB transaction)                   │
│          ▼                                                  │
│  FoodicsSyncService.syncMealCollection()                    │
│          │                                                  │
│          ├─ buildFoodicsOrder()    ← pure function          │
│          │       │                                          │
│          │       ▼                                          │
│          ├─ FoodicsClient.post('/orders', payload)          │
│          │       │                                          │
│          │  ┌────┴────┐                                     │
│          │  │ Success │──► Update meal: foodics_order_id    │
│          │  └─────────┘   Insert sync_log: status=synced    │
│          │                                                  │
│          │  ┌─────────┐                                     │
│          │  │ Failure │──► Insert sync_log: status=retrying  │
│          │  └────┬────┘   Set next_retry_at (backoff)       │
│          │       │                                          │
│          │       ▼                                          │
│          │  processRetryQueue() ← cron/setInterval (1min)   │
│          │       │                                          │
│          │       ├─ Fetch entries: status=retrying,          │
│          │       │  next_retry_at <= now, LIMIT 10           │
│          │       │                                          │
│          │       ├─ Retry each via FoodicsClient             │
│          │       │                                          │
│          │       ├─ Success → status=synced                  │
│          │       └─ Failure → increment attempt,             │
│          │                    calculate next backoff,        │
│          │                    or status=failed if exhausted  │
│          │                                                  │
│  Admin Routes                                               │
│          ├─ GET  /admin/foodics/sync-status                  │
│          └─ POST /admin/foodics/retry/:id                    │
│                                                             │
│  Feature Flag: FOODICS_SYNC_ENABLED=false (default)         │
└─────────────────────────────────────────────────────────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │  Foodics API v5       │
        │  POST /orders         │
        │  Rate: 30 req/min     │
        │                       │
        │  Sandbox: api-sandbox │
        │  Prod: api.foodics    │
        └───────────────────────┘
```

## Options Considered

### Option A -- Eventual sync with retry queue (chosen)

- Summary: Foodics order creation happens asynchronously after the FLOD meal collection DB transaction. Failures are queued in `foodics_sync_log` with exponential backoff retry.
- Why chosen: Foodics downtime does not block meal collections. FLOD DB is always source of truth. Retry queue ensures eventual consistency. Admin can monitor and manually retry.

### Option B -- Transactional sync (rejected)

- Summary: Foodics order creation happens inside the FLOD meal collection DB transaction. If Foodics fails, the entire collection is rolled back.
- Why rejected: Foodics downtime would block all meal collections across 15 branches. This is unacceptable for a POS integration that handles peak lunchtime traffic. Abu Mazen explicitly stated that meal collection must never be blocked by external systems.

### Option C -- Fire-and-forget with reconciliation (rejected)

- Summary: Foodics order creation is fire-and-forget with no retry. A daily reconciliation job compares FLOD meals vs Foodics orders and re-syncs mismatches.
- Why rejected: Abu Talin needs same-day sync for financial closing. A daily reconciliation job would not meet the "within hours" SLA. The retry queue approach provides near-real-time sync with automatic recovery.

## Simplicity And Elegance Review

- Simplest viable shape: Four new files in `src/services/foodics/` (types, validators, client, order builder, sync service) plus schema changes and env config. No new abstractions beyond what already exists in the service layer pattern.
- Coupling check: The Foodics module is isolated. No existing service is modified in Phase 0. The sync service takes a `Db` and `FoodicsClient` via constructor injection, matching the existing service pattern.
- Future-proofing: The `FoodicsClient` is generic enough to handle any Foodics API endpoint. The sync service pattern can extend to House Account credit sync in Phase 2 without refactoring.

## Components And Interfaces

### Foodics HTTP Client (`foodics.client.ts`)

- Purpose: Typed HTTP client for Foodics API v5 with rate limiting, retry, and error handling
- Implementation: Wraps Node.js 20 native `fetch`. Token bucket rate limiter (30 tokens/min, refilled per second). Exponential backoff with jitter on 429/5xx. Optional Zod schema validation on responses.
- Key methods:
  - `get<T>(path, schema?) → Promise<T>` -- GET with optional response validation
  - `post<T>(path, body, schema?) → Promise<T>` -- POST with optional response validation
  - `put<T>(path, body, schema?) → Promise<T>` -- PUT with optional response validation
- Error types:
  - `FoodicsApiError` -- HTTP error with `statusCode`, `message`, `retryable` flag, optional `errors` record
  - `FoodicsValidationError` -- Zod validation failure on response
- Dependencies: `FOODICS_API_URL`, `FOODICS_ACCESS_TOKEN` from env
- Requirements: `R1`

### Foodics Types (`foodics.types.ts`)

- Purpose: TypeScript interfaces for all Foodics API request/response shapes
- Implementation: Pure type definitions, no runtime code. Covers: branches, products, categories, customers, house accounts, payment methods, taxes, settings, orders, orders calculator, webhooks, errors. Also includes FLOD-specific types: `FlodMealCollectionInput`, `FoodicsOrderPayload`, `FoodicsSyncStatus`.
- Requirements: `R6.AC1`

### Foodics Validators (`foodics.validators.ts`)

- Purpose: Zod schemas for runtime validation of Foodics API responses
- Implementation: Zod 4 schemas matching each Foodics response type. Generic wrappers `foodicsPaginatedSchema(itemSchema)` and `foodicsSingleSchema(itemSchema)` for paginated and single responses.
- Requirements: `R6.AC2`, `R6.AC3`

### Foodics Order Builder (`foodics-order.builder.ts`)

- Purpose: Pure function transforming FLOD meal collection data into Foodics order payload
- Implementation: `buildFoodicsOrder(input: FlodMealCollectionInput) → FoodicsOrderPayload`
  1. Extract VAT from inclusive price: `exVat = round(price / 1.15, 2)`
  2. Build product with `product_id`, `quantity`, `unit_price` (5-decimal string)
  3. Optionally add `options` array for modifier options
  4. Optionally add `notes` for customer notes
  5. Optionally add `discount_amount` for per-line discounts
  6. Build payment with `payment_method_id` and total amount
  7. Set `reference: FLOD-{mealId}` for cross-referencing
- Also: `validateFoodicsMappings()` -- checks that required Foodics IDs exist
- Dependencies: None (pure function)
- Requirements: `R2`

### Foodics Sync Service (`foodics-sync.service.ts`)

- Purpose: Manages Foodics order sync lifecycle with retry queue
- Implementation: Class with `Db` and `FoodicsClient` constructor injection
- Key methods:
  - `syncMealCollection(input) → { synced, foodicsOrderId?, syncLogId? }` -- First attempt
  - `processRetryQueue() → { processed, succeeded, failed }` -- Batch retry (10/cycle)
  - `getSyncStatus() → { pending, synced, retrying, failed }` -- Counts by status
  - `retryById(syncLogId) → boolean` -- Manual retry for failed entries
- Retry schedule: [0ms, 60s, 300s, 900s, 3600s] -- exponential backoff
- Gated by `FOODICS_SYNC_ENABLED` feature flag
- Dependencies: `Db` (Drizzle), `FoodicsClient`
- Requirements: `R3`

### Database Schema Changes

- Purpose: Track Foodics sync state across FLOD entities
- Implementation: Drizzle ORM schema additions in `src/db/schema.ts`:
  - New enum: `foodics_sync_status` (pending, synced, failed, retrying)
  - New columns: `branches.foodics_branch_id`, `products.foodics_product_id`, `users.foodics_customer_id`, `subscription_daily_meals.{foodics_order_id, foodics_synced_at, foodics_sync_status}`
  - New table: `foodics_sync_log` with indexes on `(status, next_retry_at)` and `(meal_id)`
- Migration: Auto-generated via `drizzle-kit generate`
- Requirements: `R4`

### Environment Configuration

- Purpose: Centralize all Foodics config in env vars with safe defaults
- Variables:
  - `FOODICS_API_URL` -- base URL (default: sandbox)
  - `FOODICS_ACCESS_TOKEN` -- Bearer token (no default)
  - `FOODICS_PAYMENT_METHOD_ID` -- House Account payment method UUID (no default)
  - `FOODICS_SYNC_ENABLED` -- feature flag (default: `false`)
  - `FOODICS_MAX_RETRY_ATTEMPTS` -- max retries (default: `5`)
- Requirements: `R7`

## Data Models

### New Enum: `foodics_sync_status`

| Value      | Meaning                              |
| ---------- | ------------------------------------ |
| `pending`  | Initial state (not yet attempted)    |
| `synced`   | Successfully synced to Foodics       |
| `retrying` | Failed, queued for retry             |
| `failed`   | Permanently failed after max retries |

### New Table: `foodics_sync_log`

| Column             | Type                | Nullable | Default             | Description                                     |
| ------------------ | ------------------- | -------- | ------------------- | ----------------------------------------------- |
| `id`               | uuid                | no       | `gen_random_uuid()` | Primary key                                     |
| `meal_id`          | uuid (FK)           | no       | --                  | References `subscription_daily_meals.id`        |
| `status`           | foodics_sync_status | no       | `'pending'`         | Current sync status                             |
| `foodics_order_id` | text                | yes      | --                  | Foodics order UUID (set on success)             |
| `attempt`          | int                 | no       | `1`                 | Current attempt number                          |
| `error_message`    | text                | yes      | --                  | Last error message                              |
| `request_payload`  | jsonb               | yes      | --                  | Foodics API request body (for debugging/replay) |
| `next_retry_at`    | timestamptz         | yes      | --                  | When to next attempt retry                      |
| `created_at`       | timestamptz         | no       | `now()`             | Record creation time                            |
| `updated_at`       | timestamptz         | no       | `now()`             | Last update time                                |

**Indexes:**

- `(status, next_retry_at)` -- retry queue query performance
- `(meal_id)` -- audit lookup by meal

### Modified Tables

| Table                      | New Column            | Type                | Purpose               |
| -------------------------- | --------------------- | ------------------- | --------------------- |
| `branches`                 | `foodics_branch_id`   | text                | Foodics branch UUID   |
| `products`                 | `foodics_product_id`  | text                | Foodics product UUID  |
| `users`                    | `foodics_customer_id` | text                | Foodics customer UUID |
| `subscription_daily_meals` | `foodics_order_id`    | text                | Foodics order UUID    |
| `subscription_daily_meals` | `foodics_synced_at`   | timestamptz         | When synced           |
| `subscription_daily_meals` | `foodics_sync_status` | foodics_sync_status | Sync status           |

## Error Handling

### FoodicsApiError

Thrown by `FoodicsClient` when the Foodics API returns a non-2xx response.

| Property     | Type                       | Description                          |
| ------------ | -------------------------- | ------------------------------------ |
| `message`    | string                     | Error message from Foodics           |
| `statusCode` | number                     | HTTP status code                     |
| `retryable`  | boolean                    | `true` for 429, 5xx; `false` for 4xx |
| `errors`     | `Record<string, string[]>` | Validation errors (422 responses)    |

### FoodicsValidationError

Thrown by `FoodicsClient` when a Zod schema validation fails on a Foodics API response.

| Property   | Type     | Description                              |
| ---------- | -------- | ---------------------------------------- |
| `message`  | string   | "Foodics API response validation failed" |
| `zodError` | ZodError | The Zod validation error                 |

### Sync Error Strategy

1. **Retryable errors** (429, 5xx, network errors): Queue for retry with backoff
2. **Non-retryable errors** (400, 422): Mark as `failed` immediately
3. **Max retries exhausted**: Mark as `failed`, log warning, require manual intervention
4. **FLOD meal collection**: Never blocked or rolled back by Foodics errors

## Security Considerations

- Bearer token stored in `FOODICS_ACCESS_TOKEN` env var -- never logged or exposed in API responses
- Request payloads stored in `foodics_sync_log.request_payload` for debugging -- ensure no sensitive customer data beyond IDs
- Admin sync monitoring endpoints require authentication and admin role
- Rate limiting prevents accidental DDoS of Foodics API

## Failure Modes And Tradeoffs

- Failure mode: Foodics API is down for extended period (> 5 retries / > 1 hour)
  - Mitigation: Meals marked `failed` in sync log. Admin can manually retry after Foodics recovers. FLOD meal collection continues unaffected.
  - Tradeoff: Abu Talin's financial reports may be delayed. Acceptable because FLOD DB has complete audit trail.

- Failure mode: Foodics rate limit exceeded during peak collection time (15 branches, ~200 meals/hour)
  - Mitigation: Token bucket rate limiter caps at 30 req/min. Retry queue processes 10 entries/cycle. Excess entries wait for next cycle.
  - Tradeoff: Some syncs delayed by minutes during peak. Acceptable for eventual consistency model.

- Failure mode: Foodics API response shape changes without notice
  - Mitigation: Zod validators catch unexpected shapes at runtime. `FoodicsValidationError` is logged. Sync entry queued for retry.
  - Tradeoff: Requires code update to match new API shape. Foodics v5 is stable and versioned.

- Failure mode: Stale retry entries accumulate (e.g. permanently invalid payload)
  - Mitigation: Max 5 retries, then permanent `failed` status. Admin monitoring endpoint surfaces failed entries. Manual review required.
  - Tradeoff: Small maintenance burden for Abu Talin. Acceptable given the low expected failure rate.

## Testing Strategy

### Unit Tests (Phase 0 -- implemented)

1. **Order builder**: 15 tests covering all meal types, prices, modifiers, discounts, edge cases (zero price, quantity > 1, missing customer)
2. **VAT extraction**: Verified against Abu Talin v5 examples (SAR 24 chicken = 20.87 + 3.13)
3. **Mapping validator**: Tests for all/some/no missing Foodics IDs

### Integration Tests (Phase 1 -- pending API keys)

1. **Sync service**: Mock `FoodicsClient`, test `syncMealCollection()` success/failure paths, retry queue processing, max retry exhaustion
2. **Admin routes**: Supertest against real Express app, test sync-status and retry endpoints

### Sandbox E2E Tests (Phase 1 -- pending API keys)

1. **Discovery**: Verify branch/product/customer mapping against real sandbox data
2. **Order creation**: Create test order, verify in Foodics dashboard
3. **Error cases**: Invalid product, insufficient balance, rate limiting

## Verification Plan

- Requirement proof: Unit tests prove R2 (order builder correctness), R6 (type safety). Schema migration proves R4 (database columns). Env config proves R7 (configuration). Sync service code proves R3 (retry logic) -- full integration testing deferred to Phase 1.
- Test evidence: `tests/unit/foodics/order-builder.test.ts` -- 15 tests all passing
- Build evidence: `tsc --noEmit` passes with zero errors
- Migration evidence: `drizzle-kit generate` produced `0003_breezy_psylocke.sql` with correct schema

## Requirement Coverage

| Requirement | Covered By                                                                            |
| ----------- | ------------------------------------------------------------------------------------- |
| `R1`        | `foodics.client.ts` -- typed HTTP client with rate limiting, retry, Zod validation    |
| `R1.AC1`    | Bearer token injected from `FOODICS_ACCESS_TOKEN` env var                             |
| `R1.AC2`    | `retry-after` header respected on 429 responses                                       |
| `R1.AC3`    | Exponential backoff with jitter on 5xx (max 3 retries)                                |
| `R1.AC4`    | Token bucket rate limiter: 30 tokens/min                                              |
| `R1.AC5`    | Optional Zod schema validation on `get()` and `post()`                                |
| `R1.AC6`    | `FoodicsApiError` with `statusCode`, `message`, `retryable`                           |
| `R1.AC7`    | Pino child logger `{ module: 'foodics-client' }`                                      |
| `R2`        | `foodics-order.builder.ts` -- pure function, 15 unit tests                            |
| `R2.AC1`    | Order built with type 3, correct IDs, `FLOD-{mealId}` reference                       |
| `R2.AC2`    | VAT extraction: `24 / 1.15 = 20.87`, `42 / 1.15 = 36.52`                              |
| `R2.AC3`    | Modifier options array with `modifier_option_id` and `quantity: 1`                    |
| `R2.AC4`    | Product `notes` field set from input                                                  |
| `R2.AC5`    | Per-line `discount_amount` with adjusted payment                                      |
| `R2.AC6`    | `customer_id` omitted when undefined                                                  |
| `R2.AC7`    | Pure function, no I/O, fully unit-tested                                              |
| `R3`        | `foodics-sync.service.ts` -- sync lifecycle with retry queue                          |
| `R3.AC1`    | `syncMealCollection()` calls `POST /orders` when enabled                              |
| `R3.AC2`    | Success path: updates meal record + inserts sync log                                  |
| `R3.AC3`    | Retryable failure: inserts sync log with backoff schedule                             |
| `R3.AC4`    | Non-retryable failure: marks as `failed` immediately                                  |
| `R3.AC5`    | `processRetryQueue()` fetches ready entries, retries in batch                         |
| `R3.AC6`    | Max attempts check: `attempt >= maxRetryAttempts → failed`                            |
| `R3.AC7`    | `FOODICS_SYNC_ENABLED` feature flag gates all sync                                    |
| `R3.AC8`    | Sync errors caught, never propagated to caller                                        |
| `R4`        | `schema.ts` modifications + migration `0003_breezy_psylocke.sql`                      |
| `R4.AC1`    | `branches.foodics_branch_id` text column                                              |
| `R4.AC2`    | `products.foodics_product_id` text column                                             |
| `R4.AC3`    | `users.foodics_customer_id` text column                                               |
| `R4.AC4`    | `subscription_daily_meals.{foodics_order_id, foodics_synced_at, foodics_sync_status}` |
| `R4.AC5`    | `foodics_sync_log` table with all specified columns                                   |
| `R4.AC6`    | Indexes on `(status, next_retry_at)` and `(meal_id)`                                  |
| `R5`        | Sync service methods `getSyncStatus()` and `retryById()` (routes in Phase 2)          |
| `R5.AC1`    | `getSyncStatus()` returns counts by status                                            |
| `R5.AC2`    | `retryById()` resets failed entry to retrying                                         |
| `R5.AC3`    | Route-level auth deferred to Phase 2 admin routes implementation                      |
| `R6`        | `foodics.types.ts` + `foodics.validators.ts`                                          |
| `R6.AC1`    | TypeScript interfaces for all Foodics API shapes                                      |
| `R6.AC2`    | Zod schemas for response validation                                                   |
| `R6.AC3`    | Generic `foodicsPaginatedSchema()` and `foodicsSingleSchema()`                        |
| `R7`        | `.env.example` with documented Foodics variables                                      |
| `R7.AC1`    | All 5 env vars documented                                                             |
| `R7.AC2`    | `FOODICS_SYNC_ENABLED` defaults to `false`                                            |
| `R7.AC3`    | `FOODICS_MAX_RETRY_ATTEMPTS` defaults to `5`                                          |
| `R7.AC4`    | `.env.example` updated with comments                                                  |
| `NFR1`      | Token bucket: 30 tokens/min in `foodics.client.ts`                                    |
| `NFR2`      | Order builder is pure computation, no I/O                                             |
| `NFR3`      | Retry queue: `LIMIT 10` in `processRetryQueue()`                                      |
| `NFR4`      | All files pass `tsc --noEmit` with strict mode                                        |
