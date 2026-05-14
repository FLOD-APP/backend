---
status: approved
approved_at: 2026-05-14T10:10:00Z
last_modified: 2026-05-14T10:10:00Z
source_design_approved_at: 2026-05-14T10:05:00Z
---

# Implementation Plan

## Phase 0 -- Code Without API Keys (All Complete)

- [x] 1. Create Foodics TypeScript types
  - [x] 1.1 Create `src/services/foodics/foodics.types.ts` with interfaces for all Foodics API request/response shapes and FLOD integration types
    - Requirements: `R6.AC1`
    - Design: Foodics Types
    - Verification:
      - command: ["npx", "tsc", "--noEmit"]
        covers: ["R6.AC1"]

- [x] 2. Create Foodics Zod validators
  - [x] 2.1 Create `src/services/foodics/foodics.validators.ts` with Zod schemas and generic paginated/single wrappers
    - Requirements: `R6.AC2`, `R6.AC3`
    - Design: Foodics Validators
    - Verification:
      - command: ["npx", "tsc", "--noEmit"]
        covers: ["R6.AC2", "R6.AC3"]

- [x] 3. Build Foodics HTTP client
  - [x] 3.1 Create `src/services/foodics/foodics.client.ts` with rate limiting, retry, Zod validation, and error types
    - Requirements: `R1.AC1`, `R1.AC2`, `R1.AC3`, `R1.AC4`, `R1.AC5`, `R1.AC6`, `R1.AC7`
    - Design: Foodics HTTP Client
    - Verification:
      - command: ["npx", "tsc", "--noEmit"]
        covers: ["R1.AC1", "R1.AC2", "R1.AC3", "R1.AC4", "R1.AC5", "R1.AC6", "R1.AC7"]

- [x] 4. Build Foodics order builder
  - [x] 4.1 Create `src/services/foodics/foodics-order.builder.ts` with `buildFoodicsOrder()` pure function and `validateFoodicsMappings()` helper
    - Requirements: `R2.AC1`, `R2.AC2`, `R2.AC3`, `R2.AC4`, `R2.AC5`, `R2.AC6`, `R2.AC7`
    - Design: Foodics Order Builder
    - Verification:
      - command: ["npx", "jest", "tests/unit/foodics/order-builder.test.ts", "--no-cache", "--no-coverage"]
        covers: ["R2.AC1", "R2.AC2", "R2.AC3", "R2.AC4", "R2.AC5", "R2.AC6", "R2.AC7"]

- [x] 5. Write unit tests for order builder
  - [x] 5.1 Create `tests/unit/foodics/order-builder.test.ts` with 15 tests covering all meal types, modifiers, discounts, and edge cases
    - Requirements: `R2.AC1`, `R2.AC2`, `R2.AC3`, `R2.AC4`, `R2.AC5`, `R2.AC6`, `R2.AC7`
    - Design: Testing Strategy -- Unit Tests
    - Verification:
      - command: ["npx", "jest", "tests/unit/foodics/order-builder.test.ts", "--no-cache", "--no-coverage"]
        covers: ["R2.AC1", "R2.AC2", "R2.AC3", "R2.AC4", "R2.AC5", "R2.AC6", "R2.AC7"]

- [x] 6. Build Foodics sync service
  - [x] 6.1 Create `src/services/foodics/foodics-sync.service.ts` with sync lifecycle, retry queue, admin monitoring, and feature flag gating
    - Requirements: `R3.AC1`, `R3.AC2`, `R3.AC3`, `R3.AC4`, `R3.AC5`, `R3.AC6`, `R3.AC7`, `R3.AC8`
    - Design: Foodics Sync Service
    - Verification:
      - command: ["npx", "tsc", "--noEmit"]
        covers: ["R3.AC1", "R3.AC2", "R3.AC3", "R3.AC4", "R3.AC5", "R3.AC6", "R3.AC7", "R3.AC8"]

- [x] 7. Add database schema changes
  - [x] 7.1 Add Foodics columns to `branches`, `products`, `users`, `subscription_daily_meals` tables and create `foodics_sync_log` table in `src/db/schema.ts`
    - Requirements: `R4.AC1`, `R4.AC2`, `R4.AC3`, `R4.AC4`, `R4.AC5`, `R4.AC6`
    - Design: Database Schema Changes
    - Verification:
      - command: ["npx", "drizzle-kit", "generate"]
        covers: ["R4.AC1", "R4.AC2", "R4.AC3", "R4.AC4", "R4.AC5", "R4.AC6"]

- [x] 8. Create barrel export
  - [x] 8.1 Create `src/services/foodics/index.ts` barrel export
    - Requirements: none (convenience)
    - Verification:
      - command: ["npx", "tsc", "--noEmit"]

- [x] 9. Configure environment variables
  - [x] 9.1 Add Foodics env vars to `.env.example` with documentation
    - Requirements: `R7.AC1`, `R7.AC2`, `R7.AC3`, `R7.AC4`
    - Design: Environment Configuration
    - Verification:
      - command: ["sh", "-c", "grep -q 'FOODICS_SYNC_ENABLED' .env.example"]
        covers: ["R7.AC1", "R7.AC2", "R7.AC3", "R7.AC4"]

- [x] 10. Create Postman collection
  - [x] 10.1 Create `DOCS/postman/FLOD_Foodics_API_v5.postman_collection.json` and environment file
    - Requirements: none (developer tooling)
    - Verification:
      - command: ["sh", "-c", "test -f DOCS/postman/FLOD_Foodics_API_v5.postman_collection.json"]

- [x] 11. Fix frontend VAT model (BL-112)
  - [x] 11.1 Update `flod-app/src/utils/vat.ts` to VAT-inclusive extraction
  - [x] 11.2 Rewrite `flod-app/src/utils/__tests__/vat.test.ts`
  - [x] 11.3 Update `flod-app/src/hooks/usePlanPricing.ts` to use `calculatePricing()`
  - [x] 11.4 Update `flod-app/src/mocks/handlers/payment.handlers.ts` for VAT-inclusive math
    - Requirements: none (prerequisite -- corrects pricing across the system)
    - Verification:
      - command: ["npx", "jest", "--no-cache", "--no-coverage"]

- [x] 12. Create Walden feature spec
  - [x] 12.1 Create `.walden/specs/foodics-integration/requirements.md`
  - [x] 12.2 Create `.walden/specs/foodics-integration/design.md`
  - [x] 12.3 Create `.walden/specs/foodics-integration/tasks.md` (this file)
    - Requirements: none (project documentation)

## Phase 1 -- Sandbox Exploration (Blocked on BL-110: API Keys)

- [ ] 13. Create discovery script
  - [ ] 13.1 Create `scripts/foodics-discovery.ts` that maps branches, products, categories, modifiers, payment methods, taxes, and customers from the Foodics sandbox
    - Requirements: `R4.AC1`, `R4.AC2`
    - Design: Phase 1 -- Discovery Script
    - Blocked by: BL-110 (Foodics API keys from Abu Talin)

- [ ] 14. Sandbox integration tests
  - [ ] 14.1 Write integration tests that create test customer, credit house account, create order, and verify via GET
    - Requirements: `R1`, `R2`, `R3`
    - Design: Testing Strategy -- Sandbox E2E Tests
    - Blocked by: BL-110 (Foodics API keys from Abu Talin)

- [ ] 15. Populate Foodics ID mappings
  - [ ] 15.1 Create seed migration populating `foodics_branch_id`, `foodics_product_id`, `foodics_customer_id` from discovery script output
    - Requirements: `R4.AC1`, `R4.AC2`, `R4.AC3`
    - Blocked by: Task 13

## Phase 2 -- Core Integration (After Sandbox Validated)

- [ ] 16. Create FoodicsService orchestration layer
  - [ ] 16.1 Create `src/services/foodics/foodics.service.ts` with `ensureCustomer()`, `creditHouseAccount()`, `createOrder()`
    - Requirements: `R3`
    - Blocked by: Phase 1

- [ ] 17. Integrate with CollectionService
  - [ ] 17.1 Modify `CollectionService.collectMeal()` to call `FoodicsSyncService.syncMealCollection()` after the DB transaction
    - Requirements: `R3.AC1`, `R3.AC8`
    - Blocked by: Task 16

- [ ] 18. Integrate with SubscriptionService
  - [ ] 18.1 Modify `SubscriptionService.create()` to create Foodics customer and credit House Account
    - Blocked by: Task 16

- [ ] 19. Create admin sync monitoring routes
  - [ ] 19.1 Create `src/routes/foodics.routes.ts` with admin endpoints for sync status and manual retry
    - Requirements: `R5.AC1`, `R5.AC2`, `R5.AC3`
    - Blocked by: Task 16

- [ ] 20. Set up retry queue cron
  - [ ] 20.1 Add setInterval or cron job to call `processRetryQueue()` every 60 seconds
    - Requirements: `R3.AC5`
    - Blocked by: Task 17

## Phase 3 -- Production Rollout

- [ ] 21. Production configuration
  - [ ] 21.1 Set production env vars: `FOODICS_API_URL=https://api.foodics.com/v5`, production token, payment method ID
  - [ ] 21.2 Enable sync for B02 (Al Rabie) only -- monitor sync log
  - [ ] 21.3 Abu Talin verifies Foodics reports match expectations
  - [ ] 21.4 Enable for remaining Stage 0 branches
    - Blocked by: Phase 2 + Abu Talin approval

- [ ] 22. Webhook setup
  - [ ] 22.1 Subscribe to `application.order.updated`, `customer.order.created`, `menu.updated` webhooks
  - [ ] 22.2 Create webhook handler endpoint with 5-second timeout compliance
    - Blocked by: Phase 2 + production deployment
