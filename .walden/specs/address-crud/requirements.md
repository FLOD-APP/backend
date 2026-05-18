---
status: approved
approved_at: 2026-05-18T14:52:14Z
last_modified: 2026-05-18T14:52:14Z
---

# Requirements Document

## Introduction

The FLOD mobile app needs a backend address CRUD API to support the smart address form. The frontend already has a fully implemented service layer, types, and hooks expecting five endpoints under `/v1/addresses`. Currently these requests return 404 because no backend implementation exists. This spec covers the five REST endpoints, database table, bilingual field storage, GPS coordinates, a two-address per-user limit (Home and Work), and a default-address toggle.

## Requirements

### R1 List Addresses

**User Story:** As a subscriber, I want to retrieve my saved addresses, so that I can select one during subscription configuration.

#### Acceptance Criteria

1. `R1.AC1` WHEN the client submits a GET request to `/v1/addresses` with a valid JWT, the system SHALL return a JSON array of all addresses belonging to the authenticated user
2. `R1.AC2` The system SHALL include the fields `id`, `label`, `streetEn`, `streetAr`, `districtEn`, `districtAr`, `cityEn`, `cityAr`, `postalCode`, `lat`, `lng`, `isDefault`, and `createdAt` in each address object
3. `R1.AC3` IF the user has no saved addresses, THEN the system SHALL return an empty array with HTTP 200

### R2 Create Address

**User Story:** As a subscriber, I want to save a new delivery address with bilingual fields, so that the app displays it correctly in both Arabic and English.

#### Acceptance Criteria

1. `R2.AC1` WHEN the client submits a POST request to `/v1/addresses` with valid bilingual address fields and GPS coordinates, the system SHALL create a new address record and return it with HTTP 201
2. `R2.AC2` The system SHALL require the fields `label`, `streetEn`, `streetAr`, `districtEn`, `districtAr`, `cityEn`, `cityAr`, `lat`, and `lng` in the request body
3. `R2.AC3` The system SHALL accept an optional `postalCode` string field
4. `R2.AC4` The system SHALL restrict the `label` field to exactly `"home"` or `"work"`
5. `R2.AC5` IF the user already has two addresses, THEN the system SHALL reject the request with HTTP 409 and error code `MAX_ADDRESSES_REACHED`
6. `R2.AC6` IF the user already has an address with the same label, THEN the system SHALL reject the request with HTTP 409 and error code `LABEL_ALREADY_EXISTS`
7. `R2.AC7` WHEN the created address is the user's first address, the system SHALL automatically set `isDefault` to true

### R3 Update Address

**User Story:** As a subscriber, I want to edit a saved address, so that I can correct street or district details after moving.

#### Acceptance Criteria

1. `R3.AC1` WHEN the client submits a PATCH request to `/v1/addresses/:id` with a valid JWT and partial address fields, the system SHALL update only the provided fields and return the full updated address with HTTP 200
2. `R3.AC2` IF the address ID does not exist or does not belong to the authenticated user, THEN the system SHALL return HTTP 404 with error code `ADDRESS_NOT_FOUND`
3. `R3.AC3` IF the request body includes `label` and another address already uses that label, THEN the system SHALL reject the request with HTTP 409 and error code `LABEL_ALREADY_EXISTS`

### R4 Delete Address

**User Story:** As a subscriber, I want to remove a saved address, so that I can manage which locations are available for delivery.

#### Acceptance Criteria

1. `R4.AC1` WHEN the client submits a DELETE request to `/v1/addresses/:id` with a valid JWT, the system SHALL delete the address and return HTTP 204
2. `R4.AC2` IF the address ID does not exist or does not belong to the authenticated user, THEN the system SHALL return HTTP 404 with error code `ADDRESS_NOT_FOUND`
3. `R4.AC3` IF the deleted address was the default and the user still has another address, THEN the system SHALL automatically promote the remaining address to default

### R5 Set Default Address

**User Story:** As a subscriber, I want to mark one of my addresses as default, so that it is pre-selected during subscription configuration.

#### Acceptance Criteria

1. `R5.AC1` WHEN the client submits a PATCH request to `/v1/addresses/:id/default` with a valid JWT, the system SHALL mark that address as default and unmark any previously default address
2. `R5.AC2` The system SHALL return the updated address with HTTP 200
3. `R5.AC3` IF the address ID does not exist or does not belong to the authenticated user, THEN the system SHALL return HTTP 404 with error code `ADDRESS_NOT_FOUND`

### R6 Authentication

**User Story:** As a platform operator, I want address endpoints to be protected, so that users can only access their own addresses.

#### Acceptance Criteria

1. `R6.AC1` IF a request to any address endpoint is missing or has an invalid JWT, THEN the system SHALL return HTTP 401
2. `R6.AC2` The system SHALL scope all address queries to the authenticated user's ID extracted from the JWT

## Non-Functional Requirements

- `NFR1` The system SHALL validate all request bodies at the route boundary using Zod schemas before invoking service logic
- `NFR2` The system SHALL follow the project's three-layer architecture: routes (validation + delegation) → services (business logic) → database (Drizzle ORM)

## Constraints And Dependencies

- `C1` The frontend contract is fixed — field names, endpoint paths, and HTTP methods must match `/Users/ashm4/Projects/FLOD/flod-app/src/types/address.types.ts` and `/Users/ashm4/Projects/FLOD/flod-app/src/constants/api.ts`
- `C2` PostgreSQL 16 via Drizzle ORM 0.45 — schema changes require a new migration
- `C3` Express 5 with JWT auth middleware (`requireAuth`) already exists
- `C4` Maximum two addresses per user (Home and Work) — enforced at the service layer

## Out Of Scope

- Map picker or geocoding on the backend (handled by frontend via Nominatim)
- Delivery zone validation on the backend (handled by frontend utility `isDeliveryZoneServiced`)
- Address search or autocomplete
