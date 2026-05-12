# Architecture

## Overview

FLOD Backend follows a **three-layer architecture** with strict separation of concerns:

```
Client Request
      ↓
  Express Router (parse + validate)
      ↓
  Service Layer (business logic)
      ↓
  Database Layer (Drizzle ORM → PostgreSQL)
      ↓
  Express Response
```

---

## Directory Structure

```
src/
├── app.ts                        # Express factory with dependency injection
├── index.ts                      # Server bootstrap (DB connection, port binding)
├── db/
│   ├── schema.ts                 # Drizzle ORM schema (all tables, enums, relations)
│   ├── connection.ts             # PostgreSQL connection via postgres driver
│   ├── migrate.ts                # Migration runner (Drizzle Kit)
│   └── seed.ts                   # Reference data seeder (156 products, 24 rotations, etc.)
├── middleware/
│   ├── auth.middleware.ts         # JWT verification → sets req.user
│   ├── error.middleware.ts        # Centralised error handler (AppError → JSON)
│   ├── validate.middleware.ts     # Zod schema validation at route boundary
│   ├── rateLimit.middleware.ts    # In-memory sliding window rate limiter
│   └── logger.middleware.ts       # Pino HTTP request/response logger
├── routes/
│   ├── auth.routes.ts             # OTP request, verify, refresh
│   ├── branch.routes.ts           # Branch listing
│   ├── checkin.routes.ts          # Check-in, branch queue, status
│   ├── health.routes.ts           # Health check (DB connectivity)
│   ├── package.routes.ts          # Package listing
│   ├── pricing.routes.ts          # Price calculation with discounts
│   ├── product.routes.ts          # Products and categories
│   ├── rotation.routes.ts         # Meal rotation schedules
│   ├── settings.routes.ts         # App settings / feature flags
│   ├── subscription.routes.ts     # Subscription CRUD + lifecycle
│   └── user.routes.ts             # User profile
├── services/
│   ├── auth.service.ts            # OTP generation, JWT signing, refresh rotation
│   ├── branch.service.ts          # Branch queries
│   ├── checkin.service.ts         # Check-in creation, status transitions
│   ├── collection.service.ts      # Meal collection verification
│   ├── package.service.ts         # Package queries with meal distributions
│   ├── pricing.service.ts         # VAT, discounts, final price calculation
│   ├── product.service.ts         # Product + category + price queries
│   ├── rotation.service.ts        # Rotation schedule queries
│   ├── settings.service.ts        # Settings queries
│   ├── subscription.service.ts    # Create, pause, resume, schedule, history
│   ├── user.service.ts            # Profile CRUD, onboarding
│   └── wallet.service.ts          # Balance queries, debit, credit with FOR UPDATE
├── validators/
│   ├── auth.validators.ts         # Phone, OTP, refresh token schemas
│   ├── checkin.validators.ts      # Check-in request schemas
│   ├── pricing.validators.ts      # Price calculation request schemas
│   └── subscription.validators.ts # Subscription creation/management schemas
├── utils/
│   ├── errors.ts                  # AppError class
│   ├── jwt.ts                     # JWT sign/verify/decode helpers
│   ├── otp.ts                     # OTP generation (6-digit, console-logged in V0)
│   ├── pauseRules.ts              # Pause budget calculator (per package type)
│   └── vat.ts                     # VAT-inclusive price calculation
└── types/
    └── index.ts                   # Shared TypeScript interfaces
```

---

## Data Flow

### Typical Request Flow

```
1. Client sends HTTP request
2. Express middleware chain:
   a. CORS (allow configured origins)
   b. JSON body parser
   c. Pino HTTP logger (logs method, URL, status, duration)
   d. Route matching
3. Route handler:
   a. Rate limiter checks (if configured for this endpoint)
   b. Auth middleware verifies JWT (if protected route)
   c. Zod validation middleware validates request body/params/query
   d. Handler calls service function with validated data
4. Service layer:
   a. Executes business logic
   b. Queries/mutates database via Drizzle ORM
   c. Returns typed result or throws AppError
5. Response:
   a. Success: JSON response with data
   b. Error: Error middleware catches AppError, returns structured error JSON
```

### Authentication Flow

```
1. POST /api/v1/auth/otp/request { phone: "+966512345678" }
   → Generate 6-digit OTP, store hashed in DB, log to console (V0)
   → Response: { success: true, expiresIn: 300 }

2. POST /api/v1/auth/otp/verify { phone, code }
   → Verify OTP hash, create/find user
   → Sign access token (15m) + refresh token (7d, with jti)
   → Store refresh token hash in DB
   → Response: { accessToken, refreshToken, user, isNewUser }

3. POST /api/v1/auth/refresh { refreshToken }
   → Verify refresh token, check hash in DB
   → Revoke old refresh token, sign new pair (rotation)
   → Response: { accessToken, refreshToken }
```

### Wallet / Balance Flow

```
1. Subscription created → wallet credited with package value
2. Meal collected → wallet debited with meal price (FOR UPDATE lock)
3. Missed day → auto-deduct meal price from wallet
4. Wallet operations ALWAYS use transaction + FOR UPDATE to prevent races
```

---

## Database Schema Overview

### Core Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `users` | Customer accounts | id, phone, name, email, password_hash |
| `otp_codes` | Pending OTP verifications | phone, code_hash, expires_at |
| `refresh_tokens` | Active refresh tokens | user_id, token_hash, expires_at, revoked_at |
| `product_categories` | Meal categories | name_en, name_ar, sort_order |
| `products` | Individual meals | category_id, sku, name_en/ar, calories, macros |
| `product_prices` | Per-tier pricing | product_id, tier, price_sar |
| `packages` | Subscription packages | name, duration_days, meals_per_day, category |
| `package_meals` | Meals included per package | package_id, product_id, day_number |
| `rotations` | Meal rotation schedules | name, type, effective_date |
| `rotation_items` | Items in each rotation | rotation_id, product_id, day_of_week |
| `swap_options` | Available meal swaps | rotation_item_id, alt_product_id |
| `branches` | Physical locations | name, type, lat, lng, is_active |
| `subscriptions` | Active subscriptions | user_id, package_id, branch_id, status, dates |
| `wallets` | User balance | user_id, balance |
| `check_ins` | Branch collection records | subscription_id, branch_id, status |
| `discounts` | Promo/renewal rules | code, type, rate, active |
| `settings` | Feature flags & config | key, value |

### Enums

- `price_tier`: base, subscription, express_base, express_subscription, app
- `package_category`: mixed, chicken, snack, sandwich, customer_choice
- `subscription_status`: pending_payment, active, paused, expired, cancelled
- `branch_type`: main, express
- `discount_type`: first_plan, renewal, promo_code, seasonal
- `fulfilment_mode`: pickup, delivery

---

## Error Handling Strategy

```typescript
// Business errors — thrown in services
class AppError extends Error {
  constructor(
    public code: string,      // Machine-readable code
    message: string,           // Human-readable message
    public statusCode: number  // HTTP status
  ) { ... }
}

// Error middleware — catches and formats
app.use((err, req, res, next) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message }
    });
  } else {
    logger.error(err);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }
    });
  }
});
```

---

## Testing Strategy

| Layer | Test Type | Location | Tools |
|-------|-----------|----------|-------|
| Utils | Unit | `tests/unit/` | Direct import, jest assertions |
| Middleware | Unit | `tests/unit/` | Mock req/res objects |
| Services | Integration | `tests/integration/` | Real DB, direct service calls |
| Routes | Integration | `tests/integration/` | Supertest + real DB |

**Key principle:** Integration tests use a real PostgreSQL database (via Docker Compose), not mocked queries. This catches schema mismatches, constraint violations, and transaction issues that mocks would miss.
