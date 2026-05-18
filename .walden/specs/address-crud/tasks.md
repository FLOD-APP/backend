---
status: approved
approved_at: 2026-05-18T14:55:03Z
last_modified: 2026-05-18T15:05:28Z
source_design_approved_at: 2026-05-18T14:54:03Z
---

# Implementation Plan

- [x] 1. Database schema and migration
  - [x] 1.1 Add `userAddresses` table to `src/db/schema.ts` and generate Drizzle migration
    - Requirements: `R1.AC2`, `R2.AC2`, `R2.AC3`, `R2.AC4`, `R2.AC6`, `R6.AC2`
    - Design: Components And Interfaces — `src/db/schema.ts`
    - Verification:
      - command: ["npx", "tsc", "--noEmit"]
      - command: ["sh", "-c", "npx drizzle-kit generate 2>&1 | grep -q 'No schema changes'"]
        covers: ["R1.AC2", "R2.AC2", "R2.AC3"]

- [x] 2. Validators
  - [x] 2.1 Create `src/validators/address.validators.ts` with Zod schemas for create and update
    - Requirements: `R2.AC2`, `R2.AC3`, `R2.AC4`, `R3.AC1`, `NFR1`
    - Design: Components And Interfaces — `src/validators/address.validators.ts`
    - Verification:
      - command: ["npx", "tsc", "--noEmit"]
        covers: ["R2.AC2", "R2.AC3", "R2.AC4", "NFR1"]

- [x] 3. Service and routes
  - [x] 3.1 Create `src/services/address.service.ts` with `AddressService` class (list, create, update, remove, setDefault)
    - Requirements: `R1.AC1`, `R1.AC3`, `R2.AC1`, `R2.AC5`, `R2.AC6`, `R2.AC7`, `R3.AC1`, `R3.AC2`, `R3.AC3`, `R4.AC1`, `R4.AC2`, `R4.AC3`, `R5.AC1`, `R5.AC2`, `R5.AC3`, `R6.AC2`
    - Design: Components And Interfaces — `src/services/address.service.ts`
    - Verification:
      - command: ["npx", "tsc", "--noEmit"]

  - [x] 3.2 Create `src/routes/address.routes.ts` and mount in `src/app.ts`
    - Requirements: `R1.AC1`, `R2.AC1`, `R3.AC1`, `R4.AC1`, `R5.AC1`, `R5.AC2`, `R6.AC1`, `NFR2`
    - Design: Components And Interfaces — `src/routes/address.routes.ts`, `src/app.ts`
    - Verification:
      - command: ["npx", "tsc", "--noEmit"]
        covers: ["R6.AC1", "NFR2"]

- [x] 4. Integration tests
  - [x] 4.1 Create `tests/integration/address.test.ts` with full CRUD + auth + business rule tests
    - Requirements: `R1.AC1`, `R1.AC2`, `R1.AC3`, `R2.AC1`, `R2.AC2`, `R2.AC4`, `R2.AC5`, `R2.AC6`, `R2.AC7`, `R3.AC1`, `R3.AC2`, `R3.AC3`, `R4.AC1`, `R4.AC2`, `R4.AC3`, `R5.AC1`, `R5.AC2`, `R5.AC3`, `R6.AC1`, `R6.AC2`
    - Design: Testing Strategy
    - Verification:
      - command: ["npx", "jest", "tests/integration/address.test.ts", "--no-cache", "--no-coverage"]
        covers: ["R1.AC1", "R1.AC2", "R1.AC3", "R2.AC1", "R2.AC2", "R2.AC4", "R2.AC5", "R2.AC6", "R2.AC7", "R3.AC1", "R3.AC2", "R3.AC3", "R4.AC1", "R4.AC2", "R4.AC3", "R5.AC1", "R5.AC2", "R5.AC3", "R6.AC1", "R6.AC2"]

- [x] 5. Final verification
  - [x] 5.1 Run TypeScript check, Prettier, and full test suite
    - Requirements: `NFR1`, `NFR2`
    - Design: Verification Plan
    - Verification:
      - command: ["npx", "tsc", "--noEmit"]
      - command: ["sh", "-c", "npx prettier --check 'src/db/schema.ts' 'src/validators/address.validators.ts' 'src/services/address.service.ts' 'src/routes/address.routes.ts' 'src/app.ts' 'tests/integration/address.test.ts'"]
      - command: ["npx", "jest", "--bail", "--no-cache", "--no-coverage"]
