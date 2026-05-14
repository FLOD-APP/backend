# FLOD Backend Backlog

> **Last updated:** 2026-05-14 (Foodics Phase 0 complete)
> **Maintained by:** Claude Code (mandatory — read at session start, update throughout)

## Status Legend

| Status        | Meaning                           |
| ------------- | --------------------------------- |
| `pending`     | Not started                       |
| `in_progress` | Actively being worked on          |
| `blocked`     | Cannot proceed — see blocker note |
| `done`        | Completed                         |
| `cancelled`   | No longer needed — reason noted   |

## Priority Legend

| Priority | Meaning                                                 |
| -------- | ------------------------------------------------------- |
| P0       | Critical — blocks launch or is a live operational issue |
| P1       | High — must be in Stage 0                               |
| P2       | Medium — should be in Stage 0 if time allows            |
| P3       | Low — post-Stage 0 or nice-to-have                      |

---

## Infrastructure & Tooling

| ID     | Task                               | Priority | Status | Notes                                                                                                   |
| ------ | ---------------------------------- | -------- | ------ | ------------------------------------------------------------------------------------------------------- |
| BL-001 | ESLint + Prettier config fix       | P1       | done   | ESLint v10 flat config fixed in eslint.config.mjs. Prettier formatting applied to all files.            |
| BL-002 | Husky + lint-staged setup          | P1       | done   | Pre-commit hook runs prettier --write on staged .ts files                                               |
| BL-003 | GitHub Actions CI pipeline         | P1       | done   | ci.yml with quality gates (tsc, eslint, prettier, unit tests) + integration tests with Postgres service |
| BL-004 | Docker build verification workflow | P2       | done   | build.yml verifies Dockerfile compiles on PRs to main                                                   |
| BL-005 | Security scanning workflow         | P2       | done   | security.yml with npm audit + license checker                                                           |
| BL-006 | Dependabot configuration           | P2       | done   | Monthly PRs to development branch with grouped dependencies                                             |
| BL-007 | PR template                        | P1       | done   | Backend-specific checklist: typecheck, lint, prettier, unit tests, integration tests, docker build      |

---

## External Integrations (Blocked)

| ID     | Task                            | Priority | Status      | Blocker                         | Notes                                                                                                                                                                                 |
| ------ | ------------------------------- | -------- | ----------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BL-008 | Gediea payment integration      | P0       | blocked     | No API docs yet                 | Payment gateway — Abu Talin to provide API docs and sandbox access                                                                                                                    |
| BL-009 | Foodics API integration         | P0       | in_progress | Sandbox access pending (BL-110) | **Phase 0 complete**: HTTP client, order builder, sync service, types, validators, migration, unit tests, Postman collection, Walden spec. Phase 1 blocked on API keys from Abu Talin |
| BL-010 | SMS provider (Mora) integration | P1       | blocked     | No API docs                     | Branded as "Flod". Used for promos, renewal reminders, OTP delivery                                                                                                                   |
| BL-011 | Real OTP delivery via Mora      | P1       | blocked     | Depends on BL-010               | Currently OTP logs to console (V0 scope)                                                                                                                                              |

| BL-110 | Foodics API keys from Abu Talin | P0 | blocked | Awaiting screen-share meeting | Abu Talin can generate from admin dashboard. WhatsApp message sent 14 May |
| BL-112 | VAT model correction (frontend) | P0 | done | | Frontend vat.ts, usePlanPricing.ts, payment.handlers.ts updated to VAT-inclusive. Backend was already correct |
| BL-113 | Six unanswered Foodics v5 questions | P0 | blocked | Awaiting call with Abu Talin | Promo+failure, discount priority, insufficient wallet, missed day dispute, partial fulfillment, report permissions |

---

## Frontend Integration

| ID     | Task                              | Priority | Status  | Notes                                                  |
| ------ | --------------------------------- | -------- | ------- | ------------------------------------------------------ |
| BL-012 | Frontend API client hookup        | P1       | pending | Replace MSW mock layer with real API calls in flod-app |
| BL-013 | CORS configuration for production | P2       | pending | Currently allows all origins — restrict to app domain  |

---

## Deployment & Operations

| ID     | Task                              | Priority | Status  | Notes                                                                               |
| ------ | --------------------------------- | -------- | ------- | ----------------------------------------------------------------------------------- |
| BL-014 | Production deployment config      | P1       | pending | Alibaba Cloud setup, environment variables, secrets management                      |
| BL-015 | Rate limiting per-endpoint tuning | P2       | pending | Current rate limits are defaults — need production tuning based on traffic patterns |
| BL-016 | Database backup strategy          | P1       | pending | Automated PostgreSQL backups, retention policy, restore testing                     |
| BL-017 | Monitoring and alerting           | P2       | pending | Pino logs to aggregation service, health check monitoring, error rate alerts        |

---

## Feature Enhancements

| ID     | Task                             | Priority | Status  | Notes                                                                                                    |
| ------ | -------------------------------- | -------- | ------- | -------------------------------------------------------------------------------------------------------- |
| BL-018 | Customer Choice package support  | P1       | pending | Fully customizable per-day subscription. Need pricing rules from Abu Talin                               |
| BL-019 | Auto-renewal implementation      | P1       | pending | Opt-in at checkout, 3-day pre-expiry trigger, exclusive discount. Needs Gediea tokenized payments        |
| BL-020 | Financial dashboard endpoints    | P2       | pending | Sales comparison, top meals/packages/branches, discount tracking, wallet reports                         |
| BL-021 | Compensation escalation workflow | P2       | pending | Top 3 only (Abu Abdulaziz / Abu Mazen / Abu Talin) can credit wallets. CS agents request → approval flow |

---

## Changelog

| Date       | Changes                                                                                                                                                                                                                                                                                                                                 |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-12 | Initial backlog created. Backend has 302 tests across 8 milestones (all complete). Infrastructure setup: CLAUDE.md, constitution, backlog, lessons, CI/CD, hooks, skills, DOCS. BL-001 through BL-021.                                                                                                                                  |
| 2026-05-14 | **Foodics Phase 0 complete.** BL-009 moved to `in_progress`. BL-112 (VAT fix) done. Added BL-110 (API keys), BL-113 (v5 questions). New files: `src/services/foodics/` (6 files), migration `0003_breezy_psylocke.sql`, unit tests (15), Postman collection, Walden spec (3 files). Frontend VAT fixed in flod-app. All 103 tests pass. |
