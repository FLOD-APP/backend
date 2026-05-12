# FLOD Backend Constitution

## What FLOD Backend Is

FLOD Backend is the **REST API** powering the FLOD meal subscription platform. It replaces the MSW mock layer used during frontend Stage 0 development with a production Node.js + PostgreSQL backend. The API serves the React Native mobile app and (future) admin dashboard.

**Stage 0 scope:** Al Rabie + Almalqa branches only. 302 tests, 8 milestones complete.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20+ (Alpine Linux in Docker) |
| Language | TypeScript 6 (strict mode) |
| Framework | Express 5 |
| ORM | Drizzle ORM 0.45 |
| Database | PostgreSQL 16 (Alpine) |
| Validation | Zod 4 |
| Auth | JWT (jsonwebtoken) + bcrypt |
| Logging | Pino + pino-http |
| Testing | Jest 30 + ts-jest + supertest |
| Code Quality | ESLint 10 (flat config) + Prettier 3 |
| Containerisation | Docker (multi-stage) + Docker Compose |
| Dev runner | tsx (watch mode) |

---

## Company Structure & Key Personnel

| Name | Role | Interviewed | Key Responsibility |
|------|------|-------------|-------------------|
| Abu Abdullah (Abdulaziz) | Owner | — | Final decisions, brand direction |
| Chef Badr Abdulaziz | Kitchen Manager / Production & Development | May 2026 | Menu, recipes, batch production, branch visits |
| Abu Mazen | Operations Lead | May 2026 | Subscription activation, pause/cancel rules, branch management |
| Abu Talin | Finance Manager | May 2026 | Payment gateway, pricing, VAT, ZATCA compliance, Foodics admin |
| Odai | Marketing Manager | May 2026 | Allergen data, brand identity, content strategy, referral/corporate partnerships |
| Amjad | Dispatch / Transportation Manager | May 2026 | QR collection, delivery ops (220/morning shift), 5 dispatch hubs |
| Mr. Hussam | Operations (Approval) | — | Approves subscription extensions |

---

## Critical Business Corrections (from Interviews)

These corrections override anything in older documents:

| Item | OLD (Wrong) | NEW (Correct) | Source |
|------|-------------|---------------|--------|
| Branch count | 24 | **14** | Amjad |
| Payment gateway | Moyasar | **Gediea** | Abu Talin |
| Delivery status | "Future feature" | **Already exists** (Ishtirak Tawseel, 220/morning) | Amjad |
| Allergen data owner | Chef Badr | **Odai** (Marketing) | Chef Badr |
| Subscription cancel | In-app | **Call centre ONLY** (deliberate) | Abu Mazen |
| ZATCA provider | Build from scratch | **Foodics** (already integrated) | Abu Talin |
| VAT rate | Not specified | **15% VAT-INCLUSIVE** — all prices include VAT | Abu Talin |
| Collection method | QR scanning | **App→Foodics direct integration** (QR rejected — too slow at peak) | Abu Mazen v2 |
| Foodics integration | Assumed working | **NO LINK EXISTS TODAY** — all manual daily entry | Abu Talin |
| Pricing model | Per-package flat rate | **Per-meal pricing** — each meal has specific price, balance depleted per collection | Abu Talin |
| Refund mechanism | Via gateway | **Manual bank transfer** — outside app and outside Gediea | Abu Talin |

---

## Backend-Specific Business Rules

### VAT-Inclusive Pricing Formula

All prices are **VAT-inclusive at 15%**. To apply a discount:

```
ex_vat = price / 1.15
discounted_ex_vat = ex_vat * (1 - discount_rate)
final_price = discounted_ex_vat * 1.15
```

**Known rounding issue:** SAR 12 → 12/1.15 = 10.4347... → 10.43 × 1.15 = 11.9945 → rounds to SAR 11.99 (penny loss). Use `ROUND(value, 2)` consistently.

### Discount Priority (No Stacking)

Only ONE discount applies per order. Priority:
1. **Promo code** (highest — if valid, overrides all others)
2. **First-plan 10% discount** (new subscriber, no previous subscription)
3. **Renewal 5% discount** (any returning subscriber — permanent, no cutoff period)

### Wallet FOR UPDATE Locking

Wallet balance operations MUST use `SELECT ... FOR UPDATE` within a transaction to prevent race conditions on concurrent meal collections or top-ups:

```sql
BEGIN;
SELECT balance FROM wallets WHERE user_id = $1 FOR UPDATE;
-- deduct or credit
UPDATE wallets SET balance = balance - $amount WHERE user_id = $1;
COMMIT;
```

### Pause Rules

| Package | Max Pause Days | Notes |
|---------|---------------|-------|
| 12 days | 3 days | Fridays excluded from count |
| 18 days | 6 days | Fridays excluded from count |
| 24 days | 10 days | Fridays excluded from count |

- Pause **extends end_date** by pause days (not absorbed)
- Multiple pauses allowed (budget model, not single continuous)
- Delivery pause: midnight cutoff → effective next day
- Resume: customer continues daily schedule (no meal shifting)

### Missed-Day Auto-Consume

If a subscriber does not collect their meal by end of branch hours (2:00 AM), the day is automatically marked as consumed and the meal price is deducted from their wallet balance. No-show rate < 1%.

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/app.ts` | Express factory with dependency injection |
| `src/index.ts` | Server bootstrap (DB connection, port binding) |
| `src/db/schema.ts` | Drizzle ORM schema (all tables, enums, relations) |
| `src/db/connection.ts` | PostgreSQL connection via `postgres` driver |
| `src/db/migrate.ts` | Migration runner |
| `src/db/seed.ts` | Reference data seeder |
| `src/middleware/auth.middleware.ts` | JWT verification middleware |
| `src/middleware/error.middleware.ts` | Centralised error handler (AppError → JSON) |
| `src/middleware/validate.middleware.ts` | Zod validation middleware |
| `src/middleware/rateLimit.middleware.ts` | Rate limiting per endpoint |
| `src/routes/*.routes.ts` | Express routers (thin — delegate to services) |
| `src/services/*.service.ts` | Business logic layer (DB access via Drizzle) |
| `src/validators/*.validators.ts` | Zod schemas for request validation |
| `src/utils/errors.ts` | AppError class for business errors |
| `src/utils/jwt.ts` | JWT sign/verify helpers |
| `src/utils/vat.ts` | VAT calculation utility |
| `src/utils/pauseRules.ts` | Pause budget calculation |
| `src/types/index.ts` | Shared TypeScript types |

---

## Conventions

### Three-Layer Architecture

```
Request → Route → Service → Database
                      ↓
                  AppError (thrown on business rule violation)
                      ↓
                  Error Middleware (catches, formats, responds)
```

- **Routes:** Parse request, validate via Zod middleware, call service, send response. No business logic.
- **Services:** All business logic. Receive typed inputs, return typed outputs. Access DB via Drizzle.
- **Database:** Drizzle ORM only. No raw SQL in routes or services (except `sql` template tag for complex queries).

### Error Handling

```typescript
throw new AppError('INSUFFICIENT_BALANCE', 'Wallet balance too low', 402);
```

- Business errors use `AppError` with a code, message, and HTTP status
- Validation errors return 400 with Zod error details
- Auth errors return 401/403
- Unexpected errors return 500 (logged by Pino, details hidden from client)

### Zod at Route Boundary

All request validation happens at the route level via `validate()` middleware:

```typescript
router.post('/', validate(createSubscriptionSchema), async (req, res) => { ... });
```

Never validate inside services — services receive already-validated typed data.

### Test Patterns

- **Integration tests** (`tests/integration/`): Use supertest against the real Express app with a real PostgreSQL database. Test full request/response cycles.
- **Unit tests** (`tests/unit/`): Test pure utility functions (vat, pauseRules, otp) with direct imports.
- **Test DB cleanup:** Use dependency-ordered deletes in `afterAll` — delete from leaf tables first to respect foreign keys.
- **No mocks for DB:** Integration tests use a real database, not mocked queries. This catches schema mismatches, constraint violations, and transaction issues.

---

## Dev Environment

- macOS, Docker Desktop
- Node.js 20+ (see `.nvmrc`)
- Docker Compose: PostgreSQL on port **5433** (not 5432 — avoids collision with system Postgres)
- `npm run dev` for tsx watch mode (auto-restart on file changes)
- `.env` file with `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`
- `npm run migrate` then `npm run seed` to initialise database

---

## API Structure

All API routes under `/api/v1/`:

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /health` | No | Health check (DB connectivity) |
| `POST /api/v1/auth/otp/request` | No | Request OTP for phone number |
| `POST /api/v1/auth/otp/verify` | No | Verify OTP, return JWT tokens |
| `POST /api/v1/auth/refresh` | No | Refresh JWT tokens |
| `GET /api/v1/branches` | Yes | List all active branches |
| `GET /api/v1/products` | Yes | List products with prices |
| `GET /api/v1/categories` | Yes | List product categories |
| `GET /api/v1/packages` | Yes | List subscription packages |
| `GET /api/v1/rotations` | Yes | List meal rotation schedules |
| `GET /api/v1/settings` | Yes | App settings (feature flags) |
| `GET /api/v1/users/me` | Yes | Current user profile |
| `PATCH /api/v1/users/me` | Yes | Update user profile |
| `POST /api/v1/pricing/calculate` | Yes | Calculate package price |
| `POST /api/v1/subscriptions` | Yes | Create subscription |
| `GET /api/v1/subscriptions/active` | Yes | Get active subscription |
| `PATCH /api/v1/subscriptions/:id/pause` | Yes | Pause subscription |
| `PATCH /api/v1/subscriptions/:id/resume` | Yes | Resume subscription |
| `GET /api/v1/subscriptions/:id/schedule` | Yes | Get meal schedule |
| `GET /api/v1/subscriptions/history` | Yes | Subscription history |
| `POST /api/v1/subscriptions/:id/check-in` | Yes | Check in at branch |
| `GET /api/v1/branches/:id/queue` | Yes | Branch check-in queue |
| `GET /api/v1/check-ins/:id` | Yes | Check-in status |

---

## Pending Information (Awaiting from Staff)

- [ ] Gediea API documentation and sandbox access
- [ ] Per-meal pricing matrix from Abu Talin
- [ ] Foodics API documentation (Abu Talin holds access)
- [ ] SMS provider (Mora) API docs
- [ ] Brand color confirmation: #8B1A2B vs #9B182B
- [ ] Foodics integration architecture decision (replace vs alongside)
