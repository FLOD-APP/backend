# FLOD Backend — Claude Code Context

## Project Overview

FLOD Backend is the Node.js + PostgreSQL REST API powering the FLOD meal subscription platform in Riyadh, Saudi Arabia. It replaces the MSW mock layer from the frontend's Stage 0 development with a production backend. Currently serving 14 branches, ~1,000 active subscribers, SAR 850K monthly revenue. V0 scope: Al Rabie + Almalqa branches.

---

## Tech Stack

```
Runtime:          Node.js 20+ (Alpine Linux in Docker)
Language:         TypeScript 6 (strict mode)
Framework:        Express 5
ORM:              Drizzle ORM 0.45
Database:         PostgreSQL 16 (Alpine)
Validation:       Zod 4
Auth:             JWT (jsonwebtoken) + bcrypt
Logging:          Pino + pino-http
Testing:          Jest 30 + ts-jest + supertest
Code Quality:     ESLint 10 (flat config) + Prettier 3
Containerisation: Docker (multi-stage) + Docker Compose
```

---

## Backlog Maintenance (MANDATORY)

**`BACKLOG.md` at project root is the single source of truth for all pending work.**

Claude MUST follow these rules every session:
1. **Read `BACKLOG.md` at the start** of any work session to understand current priorities
2. **Update task status** when starting work (mark `in_progress`), completing work (mark `done`), or discovering blockers
3. **Add new tasks** discovered during implementation (bugs found, refactors needed, missing features)
4. **Never delete tasks** — mark them `cancelled` with a reason if no longer needed
5. **Reference backlog IDs** in commit messages when applicable (e.g., "Implements BL-001")

---

## Lessons Maintenance (MANDATORY)

**`.walden/lessons.md` captures mistakes, corrections, and guardrails — organized by category.**

Categories: `Backend / Architecture` | `Database / ORM` | `Testing` | `DevOps / Infrastructure` | `Process / Workflow`

Claude MUST follow these rules:
1. **Scan the relevant category** before starting work (e.g., check "Database / ORM" before writing a migration)
2. **Log new lessons** whenever a correction, failed approach, or surprising discovery occurs
3. **Include all three fields**: Trigger (what happened), Lesson (the pattern), Guardrail (the rule to prevent recurrence)

---

## Key Conventions

- **Never edit on `main` or `development`** — always create a feature branch first. The auto-branch hook does this automatically, but if hooks aren't active, manually run `git checkout -b feature/<domain>-<description>-MMDD` before any edit
- **Prettier before commit** — run `npx prettier --write` on all changed files before committing. A husky pre-commit hook enforces this automatically. CI will reject unformatted code.
- **Reference BL-IDs in commits** — e.g., `git commit -m "BL-003: Add Gediea payment integration"`
- **Three-layer architecture** — Routes → Services → DB. No business logic in routes. No raw SQL outside Drizzle.
- **14 branches** — NOT 24
- **Gediea** — NOT Moyasar
- **VAT is inclusive** — all prices include 15% VAT

---

## Code Standards

- TypeScript strict — no `any`
- Zod for all request validation (at route boundary via `validate()` middleware)
- Three-layer architecture: Routes → Services → DB
- `AppError` for all business errors (code + message + HTTP status)
- Service tests use real DB via supertest (no mocked queries)
- Dependency-ordered deletes in test cleanup (leaf tables first)
- `FOR UPDATE` locking on wallet balance operations
- Pino logger — no `console.log` in production code

---

## Database

```
Engine:     PostgreSQL 16 (Alpine)
Port:       5433 (local dev via Docker Compose — NOT 5432)
URL:        postgresql://flod:flod_dev_password@localhost:5433/flod_dev
Migrations: npm run migrate (Drizzle)
Seed:       npm run seed
```

Docker Compose starts Postgres with health check. Wait for healthy before running migrations.

---

## Scripts Reference

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `tsx watch src/index.ts` | Development server with hot reload |
| `build` | `tsc` | Compile TypeScript to `dist/` |
| `start` | `node dist/index.js` | Production server |
| `test` | `jest --no-cache --no-coverage` | Run all tests |
| `test:coverage` | `jest --no-cache --coverage` | Run tests with coverage report |
| `migrate` | `tsx src/db/migrate.ts` | Run database migrations |
| `seed` | `tsx src/db/seed.ts` | Seed reference data |
| `lint` | `eslint src/ tests/ && prettier --check src/ tests/` | Lint + format check |
| `lint:fix` | `eslint src/ tests/ --fix && prettier --write src/ tests/` | Auto-fix lint + format |
| `typecheck` | `tsc --noEmit` | Type check without emitting |

---

## Project Structure

```
flod_backend/
├── src/
│   ├── app.ts                    # Express factory (dependency injection)
│   ├── index.ts                  # Server bootstrap
│   ├── db/
│   │   ├── schema.ts             # Drizzle ORM schema (tables, enums)
│   │   ├── connection.ts         # PostgreSQL connection
│   │   ├── migrate.ts            # Migration runner
│   │   └── seed.ts               # Reference data seeder
│   ├── middleware/
│   │   ├── auth.middleware.ts     # JWT verification
│   │   ├── error.middleware.ts    # Centralised error handler
│   │   ├── validate.middleware.ts # Zod validation
│   │   ├── rateLimit.middleware.ts # Rate limiting
│   │   └── logger.middleware.ts   # Pino HTTP logger
│   ├── routes/                   # Express routers (thin)
│   ├── services/                 # Business logic layer
│   ├── validators/               # Zod schemas
│   ├── utils/                    # Pure helpers (jwt, vat, pauseRules, errors)
│   └── types/                    # Shared TypeScript types
├── tests/
│   ├── integration/              # Supertest + real DB tests
│   └── unit/                     # Pure function tests
├── .walden/
│   ├── constitution.md           # Authoritative project spec
│   └── lessons.md                # Past mistakes and guardrails
├── .claude/
│   ├── settings.json             # Claude Code permissions
│   ├── hooks/                    # Lifecycle hook scripts
│   └── skills/                   # Skill definitions (qc, senior_developer)
├── .github/
│   └── workflows/                # CI/CD pipelines
├── BACKLOG.md                    # Living backlog (MUST maintain)
├── CLAUDE.md                     # This file
├── DOCS/                         # API, architecture, setup documentation
├── docker-compose.yml            # PostgreSQL + API services
├── Dockerfile                    # Multi-stage production build
└── package.json
```
