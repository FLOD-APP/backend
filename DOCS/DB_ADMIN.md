# FLOD Backend — Database Administration Reference

> **Last updated:** 2026-05-13
> **Database:** PostgreSQL 16 (Alpine) via Docker Compose
> **ORM:** Drizzle ORM 0.45 with `postgres` driver

---

## Table of Contents

1. [Environment Variables](#environment-variables)
2. [Docker Setup](#docker-setup)
3. [Connectivity](#connectivity)
4. [Schema Overview](#schema-overview)
5. [Enums](#enums)
6. [Tables](#tables)
7. [Foreign Key Map](#foreign-key-map)
8. [Drizzle ORM Commands](#drizzle-orm-commands)
9. [psql Quick Reference](#psql-quick-reference)
10. [Backup and Restore](#backup-and-restore)
11. [Connection Pool Settings](#connection-pool-settings)
12. [Seed Data Summary](#seed-data-summary)
13. [Troubleshooting](#troubleshooting)

---

## Environment Variables

All variables are defined in `.env` (local dev) or passed via `docker-compose.yml` for the containerised API.

| Variable | Example Value | Required | Description |
|----------|--------------|----------|-------------|
| `DATABASE_URL` | `postgresql://flod:flod_dev_password@localhost:5433/flod_dev` | Yes | Full PostgreSQL connection string |
| `DB_PORT` | `5433` | No | Host port mapped to container's 5432. Default: `5433` |
| `PORT` | `3000` | No | API server port. Default: `3000` |
| `NODE_ENV` | `development` | No | `development` or `production` |
| `JWT_SECRET` | `your-256-bit-secret-change-in-production` | Yes | Access token signing key |
| `JWT_REFRESH_SECRET` | `your-other-256-bit-secret-change-in-production` | Yes | Refresh token signing key |
| `CORS_ORIGIN` | `http://localhost:8081` | No | Allowed CORS origin. Default: `*` |

Copy `.env.example` to `.env` for local development:

```bash
cp .env.example .env
```

**Never commit `.env` to git.** The `.env.example` file contains safe placeholder values.

---

## Docker Setup

### Services

Defined in `docker-compose.yml`:

| Service | Image | Internal Port | Host Port | Volume |
|---------|-------|--------------|-----------|--------|
| `db` | `postgres:16-alpine` | 5432 | `${DB_PORT:-5433}` | `pgdata:/var/lib/postgresql/data` |
| `api` | Built from `Dockerfile` | 3000 | `${PORT:-3000}` | None |

### Container Credentials

| Field | Value |
|-------|-------|
| `POSTGRES_USER` | `flod` |
| `POSTGRES_PASSWORD` | `flod_dev_password` |
| `POSTGRES_DB` | `flod_dev` |

### Health Check (db service)

```yaml
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U flod -d flod_dev"]
  interval: 5s
  timeout: 3s
  retries: 5
```

The `api` service uses `depends_on: db: condition: service_healthy` to wait for PostgreSQL before starting.

### API Container Health Check

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1
```

### Lifecycle Commands

```bash
# Start both services (db + api)
docker compose up -d

# Start only the database
docker compose up -d db

# Stop everything
docker compose down

# Stop and destroy data volume (DELETES ALL DATA)
docker compose down -v

# View logs
docker compose logs db
docker compose logs -f api

# Rebuild API after code changes
docker compose up -d --build api
```

---

## Connectivity

### Connection URL Format

```
postgresql://<user>:<password>@<host>:<port>/<database>
```

### From the Host Machine (your Mac)

```bash
# Via psql
psql "postgresql://flod:flod_dev_password@localhost:5433/flod_dev"

# Or with flags
psql -h localhost -p 5433 -U flod -d flod_dev
```

- **Host:** `localhost`
- **Port:** `5433` (mapped from container's internal 5432)
- **User:** `flod`
- **Password:** `flod_dev_password`
- **Database:** `flod_dev`

### From Inside the API Container

The API container connects to the `db` service by its Docker Compose service name:

```
postgresql://flod:flod_dev_password@db:5432/flod_dev
```

- **Host:** `db` (Docker DNS resolves to the Postgres container)
- **Port:** `5432` (internal port, not the host-mapped 5433)

### From Inside the DB Container

```bash
# Exec into the container
docker compose exec db psql -U flod -d flod_dev

# Or run a one-off command
docker compose exec db psql -U flod -d flod_dev -c "SELECT count(*) FROM products;"
```

### GUI Tools (TablePlus, pgAdmin, DBeaver, etc.)

| Field | Value |
|-------|-------|
| Host | `localhost` or `127.0.0.1` |
| Port | `5433` |
| User | `flod` |
| Password | `flod_dev_password` |
| Database | `flod_dev` |
| SSL | Off (local dev) |

---

## Schema Overview

**17 tables, 8 enums.** All primary keys are `uuid` with `defaultRandom()`. All timestamps use `WITH TIME ZONE`.

### Entity Relationship Summary

```
users ─────────────┐
                    ├── subscriptions ──┬── subscription_daily_meals
otp_codes           │                   ├── wallet_transactions
refresh_tokens ─────┘                   └── check_ins
                                             │
product_categories ── products ── product_prices
                         │
                    ┌────┴────┐
            rotation_schedules  rotation_swap_options
                         │
packages ── package_meal_distribution

branches (referenced by subscriptions, product_prices, check_ins)
discount_rules (referenced by subscriptions)
system_settings (standalone key-value store)
```

---

## Enums

| Enum Name | Values |
|-----------|--------|
| `price_tier` | `base`, `subscription`, `express_base`, `express_subscription`, `app` |
| `package_category` | `mixed`, `chicken`, `snack`, `sandwich`, `customer_choice` |
| `rotation_type` | `snack`, `sandwich` |
| `branch_type` | `main`, `express` |
| `express_classification` | `buffet`, `grab_and_go` |
| `discount_type` | `first_plan`, `renewal`, `promo_code`, `seasonal` |
| `subscription_status` | `pending_payment`, `active`, `paused`, `expired`, `cancelled` |
| `fulfilment_mode` | `pickup`, `delivery` |

---

## Tables

### `product_categories`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK, default random | |
| `name_en` | text | UNIQUE, NOT NULL | |
| `name_ar` | text | NOT NULL | |
| `sort_order` | integer | NOT NULL, default 0 | |
| `in_subscription` | boolean | NOT NULL, default true | Whether category is available in subscription packages |
| `created_at` | timestamptz | NOT NULL, default now | |

### `products`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK, default random | |
| `category_id` | uuid | NOT NULL, FK → product_categories.id | |
| `sku` | text | UNIQUE | Foodics SKU code |
| `name_en` | text | NOT NULL | |
| `name_ar` | text | NOT NULL | |
| `description_en` | text | | |
| `description_ar` | text | | |
| `calories` | integer | | kcal per serving |
| `protein_g` | numeric(5,1) | | |
| `carbs_g` | numeric(5,1) | | |
| `fat_g` | numeric(5,1) | | |
| `serving_size_g` | integer | | Grams per serving |
| `allergens` | text[] | | Array of allergen names |
| `is_active` | boolean | NOT NULL, default true | |
| `is_free` | boolean | NOT NULL, default false | Carbs, sauces, vegetables |
| `protein_type` | text | | chicken, beef, salmon, shrimp, almond_fish, or NULL |
| `created_at` | timestamptz | NOT NULL, default now | |
| `updated_at` | timestamptz | NOT NULL, default now | |

### `product_prices`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK, default random | |
| `product_id` | uuid | NOT NULL, FK → products.id | |
| `tier` | price_tier | NOT NULL | Which pricing tier |
| `branch_id` | uuid | FK → branches.id | NULL = all branches |
| `price_incl_vat` | numeric(8,2) | NOT NULL | VAT-inclusive price in SAR |
| `currency` | text | NOT NULL, default 'SAR' | |
| `effective_from` | date | NOT NULL, default now | |
| `effective_to` | date | | NULL = currently active |
| `created_at` | timestamptz | NOT NULL, default now | |

**Unique constraint:** `(product_id, tier, branch_id, effective_from)`

### `packages`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK, default random | |
| `category` | package_category | NOT NULL | |
| `name_en` | text | NOT NULL | |
| `name_ar` | text | NOT NULL | |
| `meals_per_day` | integer | NOT NULL | |
| `duration_days` | integer | NOT NULL | 12, 18, or 24 |
| `total_meals` | integer | NOT NULL | |
| `price_incl_vat` | numeric(8,2) | NOT NULL | Fixed package price |
| `is_active` | boolean | NOT NULL, default true | |
| `sort_order` | integer | NOT NULL, default 0 | |
| `created_at` | timestamptz | NOT NULL, default now | |
| `updated_at` | timestamptz | NOT NULL, default now | |

**Unique constraint:** `(category, meals_per_day, duration_days)`

### `package_meal_distribution`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK, default random | |
| `package_id` | uuid | NOT NULL, FK → packages.id | |
| `protein_type` | text | NOT NULL | chicken, beef, salmon, etc. |
| `meal_count` | integer | NOT NULL | How many of this protein in the package |

**Unique constraint:** `(package_id, protein_type)`

### `rotation_schedules`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK, default random | |
| `type` | rotation_type | NOT NULL | snack or sandwich |
| `day_number` | integer | NOT NULL | Day in the 12-day cycle |
| `product_id` | uuid | NOT NULL, FK → products.id | Default item for that day |
| `price_incl_vat` | numeric(8,2) | NOT NULL | |

**Unique constraint:** `(type, day_number)`

### `rotation_swap_options`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK, default random | |
| `schedule_id` | uuid | NOT NULL, FK → rotation_schedules.id | |
| `swap_product_id` | uuid | NOT NULL, FK → products.id | Alternative product |

**Unique constraint:** `(schedule_id, swap_product_id)`

### `branches`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK, default random | |
| `foodics_ref` | text | UNIQUE, NOT NULL | Foodics branch code (B01-B18) |
| `name_en` | text | NOT NULL | |
| `name_ar` | text | NOT NULL | |
| `type` | branch_type | NOT NULL | main or express |
| `express_classification` | express_classification | | buffet or grab_and_go (express only) |
| `manager_name` | text | | |
| `latitude` | numeric(10,7) | | |
| `longitude` | numeric(10,7) | | |
| `google_maps_url` | text | | |
| `open_hour` | time | | |
| `close_hour` | time | | |
| `is_active` | boolean | NOT NULL, default true | |
| `is_stage0` | boolean | NOT NULL, default false | Al Rabie + Almalqa only for V0 |
| `created_at` | timestamptz | NOT NULL, default now | |

### `discount_rules`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK, default random | |
| `type` | discount_type | NOT NULL | first_plan, renewal, promo_code, seasonal |
| `code` | text | UNIQUE | Promo code string (NULL for auto-applied types) |
| `discount_percent` | numeric(5,2) | NOT NULL | e.g., 5.00 for 5% |
| `applies_to` | text[] | NOT NULL, default ['main_meals'] | What the discount covers |
| `max_uses` | integer | | NULL = unlimited |
| `current_uses` | integer | NOT NULL, default 0 | |
| `valid_from` | timestamptz | | |
| `valid_to` | timestamptz | | |
| `is_active` | boolean | NOT NULL, default true | |
| `created_at` | timestamptz | NOT NULL, default now | |

### `system_settings`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `key` | text | PK | Setting identifier |
| `value` | text | NOT NULL | Setting value (parsed by application) |
| `description` | text | | Human-readable description |
| `updated_at` | timestamptz | NOT NULL, default now | |
| `updated_by` | text | | Who last changed it |

**Seeded keys:** `vat_rate`, `renewal_discount_percent`, `renewal_discount_cutoff_days`, `first_plan_discount_percent`, `delivery_fee_per_day`, `prices_include_vat`

### `users`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK, default random | |
| `phone` | text | UNIQUE, NOT NULL | Saudi format: +966XXXXXXXXX |
| `name` | text | | |
| `email` | text | | |
| `language_preference` | text | NOT NULL, default 'ar' | ar or en |
| `created_at` | timestamptz | NOT NULL, default now | |
| `updated_at` | timestamptz | NOT NULL, default now | |

### `otp_codes`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK, default random | |
| `phone` | text | NOT NULL | |
| `code_hash` | text | NOT NULL | bcrypt hash of 6-digit OTP |
| `expires_at` | timestamptz | NOT NULL | Typically 5 minutes from creation |
| `used` | boolean | NOT NULL, default false | |
| `created_at` | timestamptz | NOT NULL, default now | |

### `refresh_tokens`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK, default random | |
| `user_id` | uuid | NOT NULL, FK → users.id | |
| `token_hash` | text | NOT NULL | bcrypt hash of refresh token |
| `expires_at` | timestamptz | NOT NULL | |
| `revoked` | boolean | NOT NULL, default false | Set true on rotation or logout |
| `created_at` | timestamptz | NOT NULL, default now | |

### `subscriptions`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK, default random | |
| `user_id` | uuid | NOT NULL, FK → users.id | |
| `package_id` | uuid | NOT NULL, FK → packages.id | |
| `branch_id` | uuid | NOT NULL, FK → branches.id | |
| `fulfilment` | fulfilment_mode | NOT NULL, default 'pickup' | |
| `status` | subscription_status | NOT NULL, default 'pending_payment' | |
| `start_date` | date | NOT NULL | |
| `end_date` | date | NOT NULL | Extended when paused |
| `current_day` | integer | NOT NULL, default 0 | |
| `total_days` | integer | NOT NULL | |
| `pause_days_used` | integer | NOT NULL, default 0 | |
| `pause_days_limit` | integer | NOT NULL | 3/6/10 per package |
| `discount_id` | uuid | FK → discount_rules.id | |
| `discount_percent` | numeric(5,2) | default '0' | |
| `amount_paid` | numeric(8,2) | NOT NULL | Total payment at subscription time |
| `wallet_balance` | numeric(8,2) | NOT NULL, default '0' | Remaining balance |
| `payment_id` | text | | Gediea payment reference |
| `created_at` | timestamptz | NOT NULL, default now | |
| `updated_at` | timestamptz | NOT NULL, default now | |

### `wallet_transactions`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK, default random | |
| `subscription_id` | uuid | NOT NULL, FK → subscriptions.id | |
| `type` | text | NOT NULL | meal_collection, swap_fee, refund, compensation, top_up |
| `amount` | numeric(8,2) | NOT NULL | Positive = credit, negative = debit |
| `balance_after` | numeric(8,2) | NOT NULL | Wallet balance after this transaction |
| `description` | text | | |
| `meal_id` | uuid | | Reference to the meal triggering the transaction |
| `created_by` | text | | System, user_id, or admin name |
| `created_at` | timestamptz | NOT NULL, default now | |

### `subscription_daily_meals`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK, default random | |
| `subscription_id` | uuid | NOT NULL, FK → subscriptions.id | |
| `day_number` | integer | NOT NULL | |
| `meal_slot` | integer | NOT NULL, default 1 | For multi-meal packages |
| `product_id` | uuid | NOT NULL, FK → products.id | |
| `price_incl_vat` | numeric(8,2) | NOT NULL | Price at time of assignment |
| `is_collected` | boolean | NOT NULL, default false | |
| `collected_at` | timestamptz | | |
| `is_swapped` | boolean | NOT NULL, default false | |
| `swapped_from_id` | uuid | FK → products.id | Original product before swap |
| `swap_price_diff` | numeric(8,2) | default '0' | SAR difference charged to wallet |

**Unique constraint:** `(subscription_id, day_number, meal_slot)`

### `check_ins`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK, default random | |
| `subscription_id` | uuid | NOT NULL, FK → subscriptions.id | |
| `branch_id` | uuid | NOT NULL, FK → branches.id | |
| `user_id` | uuid | NOT NULL, FK → users.id | |
| `status` | text | NOT NULL, default 'waiting' | waiting, preparing, ready, collected |
| `checked_in_at` | timestamptz | NOT NULL, default now | |
| `status_updated_at` | timestamptz | NOT NULL, default now | |

---

## Foreign Key Map

| Child Table | Column | Parent Table | Parent Column |
|-------------|--------|-------------|---------------|
| products | category_id | product_categories | id |
| product_prices | product_id | products | id |
| product_prices | branch_id | branches | id |
| packages | — | — | (standalone) |
| package_meal_distribution | package_id | packages | id |
| rotation_schedules | product_id | products | id |
| rotation_swap_options | schedule_id | rotation_schedules | id |
| rotation_swap_options | swap_product_id | products | id |
| refresh_tokens | user_id | users | id |
| subscriptions | user_id | users | id |
| subscriptions | package_id | packages | id |
| subscriptions | branch_id | branches | id |
| subscriptions | discount_id | discount_rules | id |
| wallet_transactions | subscription_id | subscriptions | id |
| subscription_daily_meals | subscription_id | subscriptions | id |
| subscription_daily_meals | product_id | products | id |
| subscription_daily_meals | swapped_from_id | products | id |
| check_ins | subscription_id | subscriptions | id |
| check_ins | branch_id | branches | id |
| check_ins | user_id | users | id |

---

## Drizzle ORM Commands

### Configuration

`drizzle.config.ts` at project root:

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? 'postgresql://flod:flod_dev_password@localhost:5432/flod_dev',
  },
});
```

**Note:** The drizzle config defaults to port `5432`. When running against the Docker Compose setup, ensure `DATABASE_URL` in `.env` points to port `5433`.

### Common Commands

```bash
# Generate migrations from schema changes
npx drizzle-kit generate

# Push schema directly (dev only — no migration files)
npx drizzle-kit push

# Run pending migrations
npm run migrate
# Equivalent to: tsx src/db/migrate.ts
# Reads DATABASE_URL from .env, runs migrations from ./drizzle/migrations/

# Seed reference data (idempotent — uses onConflictDoNothing)
npm run seed
# Equivalent to: tsx src/db/seed.ts

# Open Drizzle Studio (browser-based DB explorer)
npx drizzle-kit studio

# Drop all tables (DESTRUCTIVE — dev only)
npx drizzle-kit drop
```

### Full Reset Workflow

```bash
# 1. Tear down and recreate the container (destroys data)
docker compose down -v
docker compose up -d db

# 2. Wait for healthy
docker compose exec db pg_isready -U flod -d flod_dev

# 3. Run migrations
npm run migrate

# 4. Seed reference data
npm run seed
```

---

## psql Quick Reference

### Connect

```bash
# From host
psql "postgresql://flod:flod_dev_password@localhost:5433/flod_dev"

# From inside the db container
docker compose exec db psql -U flod -d flod_dev
```

### Useful Queries

```sql
-- List all tables
\dt

-- Describe a table
\d products

-- List all enums
SELECT typname, enumlabel
FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid
ORDER BY typname, e.enumsortorder;

-- Table row counts
SELECT schemaname, relname, n_live_tup
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;

-- Active connections
SELECT count(*) FROM pg_stat_activity WHERE datname = 'flod_dev';

-- Check database size
SELECT pg_size_pretty(pg_database_size('flod_dev'));

-- Check table sizes
SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;

-- All subscriptions with user phone
SELECT s.id, u.phone, s.status, s.start_date, s.end_date, s.wallet_balance
FROM subscriptions s JOIN users u ON s.user_id = u.id
ORDER BY s.created_at DESC;

-- Wallet transaction history for a subscription
SELECT type, amount, balance_after, description, created_at
FROM wallet_transactions
WHERE subscription_id = '<uuid>'
ORDER BY created_at;

-- Branch check-in queue
SELECT ci.status, u.name, u.phone, ci.checked_in_at
FROM check_ins ci JOIN users u ON ci.user_id = u.id
WHERE ci.branch_id = '<uuid>' AND ci.status IN ('waiting', 'preparing')
ORDER BY ci.checked_in_at;

-- Products with prices (subscription tier)
SELECT p.name_en, pp.price_incl_vat, pp.tier
FROM products p JOIN product_prices pp ON p.id = pp.product_id
WHERE pp.tier = 'subscription' AND pp.effective_to IS NULL
ORDER BY p.name_en;
```

---

## Backup and Restore

### Full Database Dump

```bash
# From the host (plain SQL format)
docker compose exec db pg_dump -U flod -d flod_dev > backup_$(date +%Y%m%d_%H%M%S).sql

# Custom format (compressed, supports parallel restore)
docker compose exec db pg_dump -U flod -d flod_dev -Fc > backup_$(date +%Y%m%d_%H%M%S).dump

# Schema only (no data)
docker compose exec db pg_dump -U flod -d flod_dev --schema-only > schema_$(date +%Y%m%d_%H%M%S).sql

# Data only (no DDL)
docker compose exec db pg_dump -U flod -d flod_dev --data-only > data_$(date +%Y%m%d_%H%M%S).sql
```

### Single Table Dump

```bash
docker compose exec db pg_dump -U flod -d flod_dev -t products > products_backup.sql
```

### Restore

```bash
# From plain SQL
docker compose exec -T db psql -U flod -d flod_dev < backup_20260513_120000.sql

# From custom format (drop + recreate)
docker compose exec -T db pg_restore -U flod -d flod_dev --clean --if-exists backup_20260513_120000.dump

# Into a fresh database
docker compose exec db createdb -U flod flod_dev_restored
docker compose exec -T db pg_restore -U flod -d flod_dev_restored backup_20260513_120000.dump
```

### Copy Data Between Environments

```bash
# Dump from one environment
pg_dump "postgresql://flod:password@prod-host:5432/flod_prod" -Fc > prod_snapshot.dump

# Restore locally (drop existing tables first)
docker compose exec -T db pg_restore -U flod -d flod_dev --clean --if-exists < prod_snapshot.dump
```

---

## Connection Pool Settings

Configured in `src/db/connection.ts`:

| Setting | Value | Notes |
|---------|-------|-------|
| `max` | 20 | Maximum connections in the pool |
| `idle_timeout` | 20 | Seconds before idle connections are closed |
| `connect_timeout` | 10 | Seconds to wait for a connection |

Retry logic: 5 attempts with exponential backoff (1s, 2s, 4s, 8s, 16s).

The migration and seed scripts use `max: 1` since they run as one-off processes.

---

## Seed Data Summary

The seed script (`src/db/seed.ts`) is idempotent — it uses `onConflictDoNothing` for all inserts. Running it multiple times is safe.

| Table | Approx. Rows | Notes |
|-------|-------------|-------|
| `system_settings` | 6 | VAT rate, discount config, delivery fee |
| `branches` | 15 | 6 main + 9 express. 2 marked `is_stage0 = true` |
| `product_categories` | 10 | Proteins, salads, carbs, sauces, etc. |
| `products` | ~145 | Full menu with nutrition and allergens |
| `product_prices` | ~500 | 5 tiers per product |
| `packages` | 27 | 7 categories × 3 durations (12/18/24 days) |
| `package_meal_distribution` | ~80 | Protein breakdown per package |
| `rotation_schedules` | 24 | 12 snack days + 12 sandwich days |
| `rotation_swap_options` | ~80 | Swap alternatives per rotation day |
| `discount_rules` | 3 | first_plan (10%), renewal (5%), sample promo |

---

## Troubleshooting

### "Database not initialized. Call connectDb first."

The application tried to use `getDb()` before `connectDb()` completed. This usually means:
- PostgreSQL isn't running: `docker compose up -d db`
- Wrong `DATABASE_URL` in `.env`
- Port conflict: another process is using port 5433

### "Connection refused" from host

```bash
# Check if the db container is running
docker compose ps

# Check if it's healthy
docker compose exec db pg_isready -U flod -d flod_dev

# Check the mapped port
docker compose port db 5432
```

### "Relation does not exist"

Migrations haven't been run:

```bash
npm run migrate
```

### Port 5433 already in use

```bash
# Find what's using it
lsof -i :5433

# Or change the port in .env
DB_PORT=5434
```

Then restart: `docker compose up -d db`

### Migration conflicts after schema changes

```bash
# Generate a new migration from current schema diff
npx drizzle-kit generate

# Or push directly in dev (skips migration files)
npx drizzle-kit push
```

### Test database issues

Integration tests use the same `DATABASE_URL` from `.env`. Tests create and clean up their own data using unique identifiers (phone numbers starting with `+966500000`). If tests fail with constraint violations, leftover data may exist:

```sql
-- Clean up test users and their data
DELETE FROM check_ins WHERE user_id IN (SELECT id FROM users WHERE phone LIKE '+966500000%');
DELETE FROM wallet_transactions WHERE subscription_id IN (SELECT id FROM subscriptions WHERE user_id IN (SELECT id FROM users WHERE phone LIKE '+966500000%'));
DELETE FROM subscription_daily_meals WHERE subscription_id IN (SELECT id FROM subscriptions WHERE user_id IN (SELECT id FROM users WHERE phone LIKE '+966500000%'));
DELETE FROM subscriptions WHERE user_id IN (SELECT id FROM users WHERE phone LIKE '+966500000%');
DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE phone LIKE '+966500000%');
DELETE FROM otp_codes WHERE phone LIKE '+966500000%';
DELETE FROM users WHERE phone LIKE '+966500000%';
```

### Wallet balance race condition

Wallet operations must use `FOR UPDATE` locking. If concurrent requests corrupt balances:

```sql
-- Check for negative balances (should never happen)
SELECT id, user_id, wallet_balance FROM subscriptions WHERE wallet_balance::numeric < 0;

-- Audit wallet transactions
SELECT subscription_id, SUM(amount) as net, MAX(balance_after) as last_balance
FROM wallet_transactions
GROUP BY subscription_id
HAVING SUM(amount) != MAX(balance_after);
```
