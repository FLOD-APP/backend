# Local Development Setup

## Prerequisites

- **Node.js 20+** (see `.nvmrc` — use `nvm use` to switch)
- **Docker Desktop** (for PostgreSQL)
- **npm** (comes with Node.js)

---

## Quick Start

```bash
# 1. Clone the repo
git clone git@github.com:FLOD-APP/backend.git flod_backend
cd flod_backend

# 2. Install dependencies
npm install

# 3. Create .env file
cp .env.example .env

# 4. Start PostgreSQL (Docker)
docker compose up -d db

# 5. Wait for database to be ready
until pg_isready -h localhost -p 5433 -U flod; do sleep 1; done

# 6. Run migrations
npm run migrate

# 7. Seed reference data
npm run seed

# 8. Start development server
npm run dev
```

The API will be available at `http://localhost:3000`.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://flod:flod_dev_password@localhost:5433/flod_dev` | PostgreSQL connection string |
| `DB_PORT` | `5433` | Host port for Docker Compose PostgreSQL |
| `PORT` | `3000` | API server port |
| `NODE_ENV` | `development` | Environment (development/test/production) |
| `JWT_SECRET` | — | Secret for signing access tokens (min 32 chars) |
| `JWT_REFRESH_SECRET` | — | Secret for signing refresh tokens (min 32 chars) |
| `CORS_ORIGIN` | `http://localhost:8081` | Allowed CORS origin (mobile app URL) |

---

## Docker Compose Services

```bash
# Start PostgreSQL only (for development)
docker compose up -d db

# Start full stack (PostgreSQL + API)
docker compose up -d

# View logs
docker compose logs -f

# Stop all services
docker compose down

# Stop and remove volumes (DELETES ALL DATA)
docker compose down -v
```

### Ports

| Service | Container Port | Host Port |
|---------|---------------|-----------|
| PostgreSQL | 5432 | **5433** (configurable via `DB_PORT`) |
| API | 3000 | 3000 |

Port 5433 is used for the host mapping to avoid collisions with any system PostgreSQL running on 5432.

---

## Database Management

```bash
# Run pending migrations
npm run migrate

# Seed reference data (categories, products, prices, rotations, branches, etc.)
npm run seed

# Connect to database directly
PGPASSWORD=flod_dev_password psql -h localhost -p 5433 -U flod -d flod_dev

# Generate a new migration after schema changes
npx drizzle-kit generate
```

---

## Development Commands

```bash
# Start dev server with hot reload
npm run dev

# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run only unit tests
npx jest tests/unit/

# Run only integration tests
npx jest tests/integration/

# Run a specific test file
npx jest tests/integration/auth.test.ts

# Type check
npm run typecheck

# Lint (ESLint + Prettier check)
npm run lint

# Auto-fix lint issues
npm run lint:fix

# Format with Prettier
npx prettier --write src/ tests/

# Build for production
npm run build
```

---

## Docker Build

```bash
# Build the production Docker image
docker compose build

# Or build directly
docker build -t flod-backend .

# Run the production image
docker run -p 3000:3000 \
  -e DATABASE_URL=postgresql://... \
  -e JWT_SECRET=... \
  -e JWT_REFRESH_SECRET=... \
  flod-backend
```

The Dockerfile uses multi-stage builds:
1. **base** stage: installs deps, compiles TypeScript
2. **production** stage: copies compiled JS, installs production deps only

---

## Troubleshooting

### Database connection refused
```bash
# Check if PostgreSQL container is running
docker compose ps

# Check container health
docker compose logs db

# Verify port mapping
pg_isready -h localhost -p 5433 -U flod
```

### Tests failing with connection errors
- Ensure Docker PostgreSQL is running on port 5433
- Run `npm run migrate` then `npm run seed` before running integration tests
- Check that `DATABASE_URL` in `.env` points to `localhost:5433`

### ESLint errors
```bash
# The project uses ESLint v10 with flat config (eslint.config.mjs)
# Do NOT use --ext flag (removed in v10)
npx eslint src/ tests/

# Auto-fix
npx eslint src/ tests/ --fix
```

### TypeScript errors after schema changes
```bash
# Regenerate types
npm run typecheck

# If Drizzle types are stale, generate new migration
npx drizzle-kit generate
```
