# API Reference

Base URL: `http://localhost:3000` (development) | TBD (production)

All authenticated endpoints require a `Bearer` token in the `Authorization` header.

---

## Health

| Method | Path | Auth | Validation | Description |
|--------|------|------|------------|-------------|
| GET | `/health` | No | No | Health check with DB connectivity status |

---

## Authentication

| Method | Path | Auth | Validation | Description |
|--------|------|------|------------|-------------|
| POST | `/api/v1/auth/otp/request` | No | Yes | Request OTP for phone (rate-limited) |
| POST | `/api/v1/auth/otp/verify` | No | Yes | Verify OTP, return JWT tokens + user |
| POST | `/api/v1/auth/refresh` | No | Yes | Refresh access token via refresh token |

---

## Users

| Method | Path | Auth | Validation | Description |
|--------|------|------|------------|-------------|
| GET | `/api/v1/users/me` | Yes | No | Get authenticated user profile |
| PATCH | `/api/v1/users/me` | Yes | No | Update user profile |

---

## Branches

| Method | Path | Auth | Validation | Description |
|--------|------|------|------------|-------------|
| GET | `/api/v1/branches` | Yes | No | List all branches (optional stage0 filter) |
| GET | `/api/v1/branches/:id` | Yes | No | Get specific branch details |
| GET | `/api/v1/branches/:id/queue` | Yes | No | Get check-in queue for a branch |

---

## Products & Categories

| Method | Path | Auth | Validation | Description |
|--------|------|------|------------|-------------|
| GET | `/api/v1/categories` | Yes | No | List all product categories |
| GET | `/api/v1/products` | Yes | No | List products (filter by tier, category, subscription) |
| GET | `/api/v1/products/:id` | Yes | No | Get specific product details |

---

## Packages

| Method | Path | Auth | Validation | Description |
|--------|------|------|------------|-------------|
| GET | `/api/v1/packages` | Yes | No | List meal packages (optional category filter) |
| GET | `/api/v1/packages/:id` | Yes | No | Get specific package details |
| GET | `/api/v1/packages/:id/schedule` | Yes | No | Generate delivery schedule for a package |

---

## Rotations

| Method | Path | Auth | Validation | Description |
|--------|------|------|------------|-------------|
| GET | `/api/v1/rotations/:type` | Yes | No | List rotation options by type |
| GET | `/api/v1/rotations/:type/:dayNumber/swaps` | Yes | No | Get available swap options for a rotation day |

---

## Settings

| Method | Path | Auth | Validation | Description |
|--------|------|------|------------|-------------|
| GET | `/api/v1/settings` | Yes | No | Get all system settings |
| PATCH | `/api/v1/settings/:key` | Yes | No | Update system setting by key |

---

## Pricing

| Method | Path | Auth | Validation | Description |
|--------|------|------|------------|-------------|
| POST | `/api/v1/pricing/calculate` | Yes | Yes | Calculate full pricing with optional promo |
| POST | `/api/v1/pricing/validate-promo` | Yes | Yes | Validate promo code eligibility |

---

## Subscriptions

| Method | Path | Auth | Validation | Description |
|--------|------|------|------------|-------------|
| POST | `/api/v1/subscriptions` | Yes | Yes | Create new subscription |
| GET | `/api/v1/subscriptions/active` | Yes | No | Get user's active subscription |
| GET | `/api/v1/subscriptions/history` | Yes | No | Get subscription history |
| GET | `/api/v1/subscriptions/:id/schedule` | Yes | No | Get meal schedule for subscription |
| POST | `/api/v1/subscriptions/:id/pause` | Yes | Yes | Pause subscription for date range |
| POST | `/api/v1/subscriptions/:id/resume` | Yes | No | Resume paused subscription |
| POST | `/api/v1/subscriptions/:id/collect` | Yes | Yes | Collect meal for a specific day |
| POST | `/api/v1/subscriptions/:id/swap` | Yes | Yes | Swap meal with alternative product |
| GET | `/api/v1/subscriptions/:id/wallet` | Yes | No | Get wallet transactions (paginated) |

---

## Check-In

| Method | Path | Auth | Validation | Description |
|--------|------|------|------------|-------------|
| POST | `/api/v1/subscriptions/:id/check-in` | Yes | Yes | Check in at a branch |
| PATCH | `/api/v1/check-ins/:id` | Yes | Yes | Update check-in status |

---

## Summary

- **Total Endpoints:** 32
- **Authenticated:** 29
- **Public:** 3 (health + auth)
- **With Validation:** 14

---

## Common Response Formats

### Success
```json
{
  "success": true,
  "data": { ... }
}
```

### Error
```json
{
  "error": {
    "code": "SUBSCRIPTION_NOT_FOUND",
    "message": "No active subscription found"
  }
}
```

### Validation Error
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request",
    "details": [
      { "path": ["phone"], "message": "Invalid phone number format" }
    ]
  }
}
```

---

## Authentication Flow

```
1. POST /api/v1/auth/otp/request  { phone: "+966512345678" }
   → 200 { success: true, expiresIn: 300 }

2. POST /api/v1/auth/otp/verify   { phone: "+966512345678", code: "123456" }
   → 200 { accessToken: "...", refreshToken: "...", user: {...}, isNewUser: true }

3. Use accessToken in Authorization header:
   Authorization: Bearer <accessToken>

4. When accessToken expires (15 min):
   POST /api/v1/auth/refresh  { refreshToken: "..." }
   → 200 { accessToken: "...", refreshToken: "..." }
```

**V0 Note:** OTP codes are logged to the console (no SMS provider connected yet).
