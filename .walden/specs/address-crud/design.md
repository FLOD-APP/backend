---
status: approved
approved_at: 2026-05-18T14:54:03Z
last_modified: 2026-05-18T14:54:03Z
source_requirements_approved_at: 2026-05-18T14:52:14Z
---

# Feature Design

## Overview

Add a `user_addresses` table and three new files — schema addition, service, routes, and validators — following the existing three-layer pattern. All five endpoints are auth-protected, scoped to the JWT user, and validated via Zod at the route boundary. The service enforces the 2-address limit and label uniqueness. A Drizzle migration creates the table.

<!-- assumed: No separate migration file — add the table definition to schema.ts and run `drizzle-kit generate` to create the migration automatically, matching the project's existing pattern -->

## Architecture

```
POST/GET/PATCH/DELETE /v1/addresses[/:id[/default]]
        │
        ▼
  address.routes.ts   (requireAuth + validate + delegate)
        │
        ▼
  address.service.ts  (AddressService class — business logic)
        │
        ▼
  schema.ts           (userAddresses table via Drizzle ORM)
```

## Options Considered

### Option A — Single service class with Drizzle (Chosen)

- Summary: One `AddressService` class with `list`, `create`, `update`, `remove`, `setDefault` methods. Drizzle ORM for all DB access. Schema defined alongside existing tables in `schema.ts`.
- Why chosen: Matches every other service in the codebase (`BranchService`, `SubscriptionService`). Minimal new concepts. The 2-address limit makes this a simple CRUD domain — no need for anything fancier.

### Option B — Repository pattern with separate data access layer

- Summary: Abstract DB access behind a repository interface, inject into service.
- Why rejected: Over-engineering for a 5-method CRUD service with max 2 rows per user. No other service in this codebase uses repositories. Adds a layer without benefit.

## Simplicity And Elegance Review

- Simplest viable shape: One table, one service class, one router, one validator file. No enums table for labels — just Zod validation at the boundary (`z.enum(['home', 'work'])`).
- Coupling check: Service depends only on Drizzle schema. Routes depend only on service + validators. No cross-service dependencies.
- Future-proofing: If the 2-address limit increases, only the service guard changes. If new labels are needed, only the Zod enum and the service guard change. No structural changes required.

## Components And Interfaces

### `src/db/schema.ts` — `userAddresses` table

- Purpose: Drizzle ORM table definition for user addresses
- Schema:

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, `defaultRandom()` |
| `user_id` | `uuid` | NOT NULL, FK → `users.id` |
| `label` | `text` | NOT NULL (`'home'` or `'work'`) |
| `street_en` | `text` | NOT NULL |
| `street_ar` | `text` | NOT NULL |
| `district_en` | `text` | NOT NULL |
| `district_ar` | `text` | NOT NULL |
| `city_en` | `text` | NOT NULL |
| `city_ar` | `text` | NOT NULL |
| `postal_code` | `text` | nullable |
| `lat` | `numeric(10,7)` | NOT NULL |
| `lng` | `numeric(10,7)` | NOT NULL |
| `is_default` | `boolean` | NOT NULL, default `false` |
| `created_at` | `timestamp(tz)` | NOT NULL, `defaultNow()` |
| `updated_at` | `timestamp(tz)` | NOT NULL, `defaultNow()` |

- Unique constraint: `(user_id, label)` — enforces one home, one work per user at the DB level
- Index: `user_id` for fast list queries
- Requirements: `R1`, `R2`, `R3`, `R4`, `R5`, `R6`

### `src/validators/address.validators.ts`

- Purpose: Zod schemas for request body validation
- Schemas:
  - `createAddressSchema`: all required fields + optional `postalCode`
  - `updateAddressSchema`: all fields optional (partial), at least one field required
- Label validated as `z.enum(['home', 'work'])`
- `lat`: `z.number().min(-90).max(90)`
- `lng`: `z.number().min(-180).max(180)`
- Requirements: `R2.AC2`, `R2.AC3`, `R2.AC4`, `NFR1`

### `src/services/address.service.ts`

- Purpose: Business logic for address CRUD
- Class: `AddressService` with constructor `(db: Db)`
- Methods:

| Method | Input | Output | Business Rules |
|--------|-------|--------|----------------|
| `list(userId)` | `string` | `Address[]` | Filter by `userId`, ordered by `createdAt` |
| `create(userId, data)` | `string`, `CreateInput` | `Address` | Check count < 2, check label unique, auto-set `isDefault` if first |
| `update(userId, id, data)` | `string`, `string`, `Partial<CreateInput>` | `Address` | Verify ownership, check label conflict if changing label |
| `remove(userId, id)` | `string`, `string` | `void` | Verify ownership, auto-promote remaining if deleted was default |
| `setDefault(userId, id)` | `string`, `string` | `Address` | Verify ownership, unset old default, set new default |

- Dependencies: Drizzle schema (`userAddresses`), `AppError`
- Requirements: `R1.AC1`–`R1.AC3`, `R2.AC1`–`R2.AC7`, `R3.AC1`–`R3.AC3`, `R4.AC1`–`R4.AC3`, `R5.AC1`–`R5.AC3`, `R6.AC2`

### `src/routes/address.routes.ts`

- Purpose: Express router — thin delegation layer
- Middleware: `requireAuth` on all routes, `validate()` on POST/PATCH
- Endpoints:

| Method | Path | Handler |
|--------|------|---------|
| GET | `/` | `addressService.list(req.user.userId)` |
| POST | `/` | `addressService.create(req.user.userId, req.body)` |
| PATCH | `/:id` | `addressService.update(req.user.userId, req.params.id, req.body)` |
| DELETE | `/:id` | `addressService.remove(req.user.userId, req.params.id)` |
| PATCH | `/:id/default` | `addressService.setDefault(req.user.userId, req.params.id)` |

- Response format: `{ data: <address|address[]> }` for consistency with frontend expectations (`data.data` pattern in service layer)
- Requirements: `R6.AC1`, `NFR2`

### `src/app.ts` — Route mounting

- Purpose: Register the address router at `/addresses` under both `/api/v1` and `/v1` prefixes
- Pattern: `app.use(\`${prefix}/addresses\`, createAddressRouter(deps.db!))`
- Requirements: `R1`, `R2`, `R3`, `R4`, `R5`

## Data Models

### Response Shape

The API returns address objects matching the frontend `Address` interface. Column names are mapped from snake_case (DB) to camelCase (JSON) in the service select projection:

```typescript
{
  id: string;
  label: string;        // 'home' | 'work'
  streetEn: string;
  streetAr: string;
  districtEn: string;
  districtAr: string;
  cityEn: string;
  cityAr: string;
  postalCode: string | null;
  lat: number;          // numeric(10,7) → parseFloat
  lng: number;          // numeric(10,7) → parseFloat
  isDefault: boolean;
  createdAt: string;    // ISO 8601
}
```

Note: Drizzle returns `numeric` columns as strings. The service must convert `lat` and `lng` to numbers via `parseFloat()` before returning, and `createdAt` timestamps to ISO strings.

## Error Handling

| Scenario | Code | HTTP | Source |
|----------|------|------|--------|
| Missing/invalid JWT | `AUTH_REQUIRED` / `AUTH_INVALID` | 401 | `requireAuth` middleware |
| Validation failure | `VALIDATION_ERROR` | 400 | `validate` middleware |
| Address not found / not owned | `ADDRESS_NOT_FOUND` | 404 | Service |
| 2-address limit exceeded | `MAX_ADDRESSES_REACHED` | 409 | Service |
| Duplicate label | `LABEL_ALREADY_EXISTS` | 409 | Service |

All errors thrown as `AppError` instances, caught by the existing `errorHandler` middleware.

## Failure Modes And Tradeoffs

- Failure mode: Unique constraint violation on `(user_id, label)` if two concurrent requests create the same label.
  - Mitigation: The DB unique constraint acts as a safety net. Service catches the Drizzle error and returns `LABEL_ALREADY_EXISTS`.
  - Tradeoff: No explicit row locking for address creation — acceptable because a user creating two addresses simultaneously from the same phone is unrealistic.

- Failure mode: `numeric` to `number` conversion loses precision beyond 7 decimal places.
  - Mitigation: `numeric(10,7)` stores up to 7 decimal places, which gives ~1cm GPS precision. `parseFloat()` handles this losslessly.
  - Tradeoff: Accepted — 7 decimal places exceeds requirement.

## Testing Strategy

Integration tests using supertest against the real Express app with a real PostgreSQL database:

- **List**: Empty response, populated response, scoped to user
- **Create**: Success, auto-default, max limit, duplicate label, validation errors
- **Update**: Partial update, not-found, label conflict
- **Delete**: Success, not-found, auto-promote default
- **Set Default**: Toggle, not-found
- **Auth**: 401 without JWT

Test cleanup: Delete from `userAddresses` then test users in `afterAll`.

## Verification Plan

- Requirement proof: Each integration test annotated with AC IDs
- Test evidence: `npx jest tests/integration/address.test.ts --no-cache --no-coverage`
- Type safety: `npx tsc --noEmit`

## Requirement Coverage

| Requirement | Covered By |
| --- | --- |
| `R1` | `address.routes.ts` GET `/` → `AddressService.list()` |
| `R1.AC1` | Route handler + service `list()` |
| `R1.AC2` | Service select projection with field mapping |
| `R1.AC3` | Service returns empty array (no special handling needed) |
| `R2` | `address.routes.ts` POST `/` → `AddressService.create()` |
| `R2.AC1` | Service `create()` + Drizzle insert + HTTP 201 |
| `R2.AC2` | `createAddressSchema` Zod validation |
| `R2.AC3` | `createAddressSchema` optional `postalCode` |
| `R2.AC4` | `z.enum(['home', 'work'])` in validator |
| `R2.AC5` | Service count check before insert |
| `R2.AC6` | Service label uniqueness check + DB unique constraint |
| `R2.AC7` | Service auto-sets `isDefault: true` when count === 0 |
| `R3` | `address.routes.ts` PATCH `/:id` → `AddressService.update()` |
| `R3.AC1` | Service `update()` with partial fields |
| `R3.AC2` | Service ownership check → `ADDRESS_NOT_FOUND` |
| `R3.AC3` | Service label conflict check on update |
| `R4` | `address.routes.ts` DELETE `/:id` → `AddressService.remove()` |
| `R4.AC1` | Service `remove()` + HTTP 204 |
| `R4.AC2` | Service ownership check → `ADDRESS_NOT_FOUND` |
| `R4.AC3` | Service auto-promote after delete |
| `R5` | `address.routes.ts` PATCH `/:id/default` → `AddressService.setDefault()` |
| `R5.AC1` | Service unsets old default, sets new default |
| `R5.AC2` | Route returns updated address |
| `R5.AC3` | Service ownership check → `ADDRESS_NOT_FOUND` |
| `R6` | `requireAuth` middleware on all routes |
| `R6.AC1` | `requireAuth` rejects missing/invalid JWT with 401 |
| `R6.AC2` | All service methods take `userId` from `req.user` |
| `NFR1` | `validate(createAddressSchema)` / `validate(updateAddressSchema)` at route boundary |
| `NFR2` | Routes → Service → DB three-layer separation |
