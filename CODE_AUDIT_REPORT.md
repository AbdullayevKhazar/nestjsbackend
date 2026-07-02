# Borc İdarəsi Backend — Code Audit Report

> **Audit Date:** 2026-07-02  
> **Scope:** Full NestJS backend (`borcidaresibackend`)  
> **Severity:** 🔴 Critical | 🟠 High | 🟡 Medium | 🟢 Low

---

## Summary

| Category | Count |
|----------|-------|
| 🔴 Critical Bugs | 4 |
| 🟠 High Security Issues | 5 |
| 🟡 Medium Design/Logic Issues | 14 |
| 🟢 Low Code Quality Issues | 12 |
| **Total** | **35** |

---

## 🔴 Critical Bugs (4)

### 1. Transaction Pagination Bug — Grouping After Pagination
**File:** `src/modules/transactions/transactions.service.ts` (line 86-123)

The `findAll` method groups transactions by customer **after** pagination. This means if a customer has 20 transactions and you request page 1 with limit 10, you will see only that customer with 10 transactions. On page 2, you'll see the **same customer again** with the remaining 10 transactions. This is completely broken pagination.

**Fix:** Group first, then paginate. Or use MongoDB aggregation with `$group`.

```typescript
// Current broken flow:
1. Find 10 transactions (skip+limit)
2. Group by customer → may show 1 customer with 10 txs
3. Next page: same customer again with remaining txs
```

### 2. Balance Can Go Negative — Schema vs Logic Conflict
**File:** `src/modules/customers/schemas/customer.schema.ts` (lines 48-67)

`balance`, `totalDebt`, `totalPaid` have `min: 0` in schema. But `increasePayment` subtracts `amount` from `balance` without checking if `balance >= amount`. If a customer has 0 balance and you create a payment of 100, MongoDB will reject the write (violates `min: 0`). But `rollbackDebt` and `rollbackPayment` can also attempt to make these negative.

**Fix:** Add business logic validation before balance updates, or remove `min: 0` if negative balances are allowed (they shouldn't be for debt tracking).

### 3. No User Registration Endpoint
**File:** `src/modules/auth/auth.controller.ts`

There's no `/auth/register` endpoint. The only way to create a user is through the hardcoded seed admin (`admin@local.com`). This is a critical missing feature.

**Fix:** Add a `POST /auth/register` endpoint with proper password hashing.

### 4. No Transaction Edit/Update Endpoint
**File:** `src/modules/transactions/transactions.controller.ts`

You can create transactions and delete them, but there's no way to **edit** a transaction. If a user makes a typo in the amount, they must delete and recreate. This is a major UX gap.

**Fix:** Add `PATCH /transactions/:id` endpoint with balance recalculation logic.

---

## 🟠 High Security Issues (5)

### 5. JWT Strategy Doesn't Validate User Exists
**File:** `src/modules/auth/strategies/jwt.strategy.ts` (line 23-26)

```typescript
async validate(payload: JwtPayload) {
  console.log('JWT VALIDATED:', payload);
  return payload;  // ← Just returns the payload, never checks DB!
}
```

The JWT strategy does **not** verify if the user still exists or is active. A deleted or deactivated user can still access all endpoints with a valid token.

**Fix:**
```typescript
async validate(payload: JwtPayload) {
  const user = await this.userService.findById(payload.sub);
  if (!user || !user.isActive) {
    throw new UnauthorizedException('User not found or inactive');
  }
  return payload;
}
```

### 6. Hardcoded Admin Password in Logs
**File:** `src/modules/users/services/seed-user.service.ts` (line 29-30)

```typescript
this.logger.warn('Password: 12345678');
```

The seed admin password is logged in **plain text** on every application startup. This is a serious security leak.

**Fix:** Remove the password log or log it only in development mode.

### 7. No Rate Limiting on Auth Endpoints
**File:** `src/modules/auth/auth.controller.ts`

Login and refresh endpoints have no rate limiting. An attacker can brute-force passwords or flood the refresh endpoint.

**Fix:** Use `@nestjs/throttler` to add rate limiting.

### 8. CORS Allows Any Origin
**File:** `src/main.ts` (line 23-26)

```typescript
app.enableCors({
  origin: true,  // ← Allows ANY origin!
  credentials: true,
});
```

With `credentials: true`, any website can make authenticated requests to your API. This is dangerous for a financial app.

**Fix:** Whitelist specific origins:
```typescript
app.enableCors({
  origin: ['http://localhost:3000', 'https://yourdomain.com'],
  credentials: true,
});
```

### 9. No Password Hashing in `UserService.create()`
**File:** `src/modules/users/users.service.ts` (line 74-76)

```typescript
async create(data: Partial<User>) {
  return this.userModel.create(data);  // ← No password hashing!
}
```

Only `SeedUserService` hashes passwords. If someone uses `UserService.create()` directly, passwords are stored in plain text.

**Fix:** Add bcrypt hashing in `UserService.create()` or create a separate `UserService.register()` method.

---

## 🟡 Medium Design/Logic Issues (14)

### 10. Missing `hasDebt` Filter Implementation
**File:** `src/modules/customers/dto/customer-query.dto.ts` (line 53-59)

The `CustomerQueryDto` has a `hasDebt` boolean field, but `CustomersService.findAll()` completely ignores it. The query parameter is accepted but never applied.

### 11. No Database Transactions for Multi-Step Operations
**File:** `src/modules/transactions/transactions.service.ts` (line 21-50)

When creating a transaction, the code:
1. Creates the transaction document
2. Updates the customer balance

If step 2 fails (e.g., MongoDB error), the transaction is already created but the balance is wrong. There's no rollback. Use MongoDB transactions (`session.startTransaction()`).

### 12. No Indexes on Transaction Schema
**File:** `src/modules/transactions/schemas/transaction.schema.ts`

The `Transaction` schema has no indexes at all. Queries like `find({ createdBy: userId, isDeleted: false })` will do full collection scans as data grows.

**Fix:** Add indexes:
```typescript
TransactionSchema.index({ createdBy: 1, isDeleted: 1, date: -1 });
TransactionSchema.index({ customerId: 1, isDeleted: 1, date: -1 });
```

### 13. `UserService.findById` Doesn't Check `isActive`
**File:** `src/modules/users/users.service.ts` (line 23-25)

When validating refresh tokens, `findById` doesn't check if the user is active. A deactivated user's refresh token could still work.

### 14. `ResponseInterceptor` Double-Wraps Already-Wrapped Data
**File:** `src/common/interceptors/response.interceptor.ts` (line 20)

The interceptor wraps `response.data` into `data` again. If a service returns `{ data: { items: [] } }`, the final response becomes `{ data: { data: { items: [] } } }`. This is confusing and inconsistent.

### 15. Inconsistent Swagger Documentation
Some controllers have `@ApiOperation` on every method, others don't. Some endpoints have `@ApiResponse`, none do. The Swagger docs are incomplete.

### 16. `products` and `backup` Modules Are Empty
**Files:** `src/modules/products/*`, `src/modules/backup/*`

These modules exist but have empty implementation files. They should be removed or implemented.

### 17. `health` Module Doesn't Check MongoDB
**File:** `src/modules/health/health.controller.ts`

The health endpoint just returns a static message. It doesn't verify MongoDB connectivity or any other dependency. This is useless for monitoring.

**Fix:** Use `@nestjs/terminus` for proper health checks.

### 18. No Request Logging
There's no request logging middleware. You can't debug production issues without knowing which endpoints are being called.

**Fix:** Add a `LoggerMiddleware` or use `morgan`/`pino`.

### 19. No Graceful Shutdown
**File:** `src/main.ts`

The application doesn't handle SIGTERM/SIGINT signals. When the container is stopped, active requests might be interrupted.

### 20. `Customer` Phone Not Unique Per User
**File:** `src/modules/customers/schemas/customer.schema.ts` (lines 16-20)

A user can create multiple customers with the same phone number. There should be a unique index on `(createdBy, phone)`.

### 21. `AuthController` Imports Unused `Req`
**File:** `src/modules/auth/auth.controller.ts` (line 1)

`Req` is imported but never used. Dead code.

### 22. Absolute Path Imports (`src/...`) Inconsistent
Some files use `src/...` absolute imports, others use `../../` relative imports. This is inconsistent and can cause issues with build tools.

### 23. No API Response Types for Swagger
No `@ApiResponse` decorators on any endpoint. Swagger UI won't show response schemas or status codes.

### 24. `CustomerSchema` Missing `createdBy` + `phone` Unique Index
**File:** `src/modules/customers/schemas/customer.schema.ts` (lines 89-95)

The phone index is not unique. Within a user's account, two customers shouldn't have the same phone number.

```typescript
CustomerSchema.index({ createdBy: 1, phone: 1 }, { unique: true });
```

### 25. No `users.controller.ts` Endpoints
**File:** `src/modules/users/users.controller.ts` (empty)

There's no way to get current user info, update profile, or list users. The controller file is empty.

### 26. `ReportsService` Timezone Issues
**File:** `src/modules/reports/reports.service.ts` (lines 27-35)

The `today`, `tomorrow`, and `monthStart` calculations use the server's local timezone. A user in a different timezone will see wrong "today" and "month" data.

### 27. `UserService.updateRefreshToken` Doesn't Check `modifiedCount`
**File:** `src/modules/users/users.service.ts` (line 27-38)

If the user doesn't exist, `updateOne` returns `modifiedCount: 0` but the caller never checks this. The login process continues as if the update succeeded.

---

## 🟢 Low Code Quality Issues (12)

### 28. `config/auth.config.ts` is Exported but Never Used
**File:** `src/config/auth.config.ts`

This config file exists but is never imported anywhere. `AuthModule` uses `jwtConfig` directly.

### 29. `console.log` Instead of Logger in `main.ts`
**File:** `src/main.ts` (line 45)

```typescript
console.log(`🚀 Server running on port ${process.env.PORT}`);
```

Should use `NestJS Logger` for consistent logging.

### 30. `database.service.ts` Methods Are Never Called
**File:** `src/database/database.service.ts`

The `connected()`, `disconnected()`, and `error()` methods exist but are never called anywhere in the app.

### 31. `common/setup/*.ts` Files Are Empty
All setup files under `src/common/setup/` are empty (0 bytes). They serve no purpose.

### 32. `shared/` Directory Not Used
The `shared/` directory has `index.ts` and `api-response.interface.ts` but they are never imported anywhere.

### 33. `ParseObjectIdPipe` Validates but Doesn't Transform
**File:** `src/common/pipes/parse-object-id.pipe.ts`

The pipe validates the ObjectId format but returns the string, not an actual `ObjectId`. Every service then has to call `new Types.ObjectId(id)` anyway. The pipe could return `new Types.ObjectId(value)` to save repeated conversions.

### 34. `JwtStrategy` Has Debug `console.log`
**File:** `src/modules/auth/strategies/jwt.strategy.ts` (line 24)

```typescript
console.log('JWT VALIDATED:', payload);
```

This logs JWT payloads to the console in production. Should be removed or use `Logger`.

### 35. Inconsistent Import Style
Some imports use `import type`, others don't. Some use `type` keyword inline, others don't. This inconsistency is just cosmetic but should be standardized.

### 36. `ResponseInterceptor` Doesn't Handle `null` Response Well
If a controller returns `null` (e.g., `void` return), the interceptor wraps it as `{ data: null, message: 'Success' }`. This is fine but some endpoints might not want the wrapper.

### 37. `HttpExceptionFilter` Doesn't Log Errors
**File:** `src/common/filters/http-exception.filter.ts`

Errors are caught and transformed to JSON but never logged. Production debugging is very difficult without error logs.

### 38. `JwtModule.registerAsync` Uses `as any` Type Assertion
**File:** `src/modules/auth/auth.module.ts` (line 21)

```typescript
expiresIn: config.expiresIn as any,
```

This should be properly typed instead of `as any`.

### 39. `main.ts` Uses `process.env` Directly Instead of ConfigService
**File:** `src/main.ts` (line 28)

```typescript
app.setGlobalPrefix(process.env.API_PREFIX || 'api/v1');
```

Should use `configService.get('app.apiPrefix')` for consistency.

### 40. `AuthService` Duplicate `bcrypt` Import
**File:** `src/modules/auth/auth.service.ts` (line 3)

`bcrypt` is imported but `@nestjs/common`'s `Inject` is also imported on a separate line. Could be combined.

---

## Missing Features (Not Bugs, But Expected)

| Feature | Impact |
|---------|--------|
| User registration | 🔴 Can't create new users |
| Password reset | 🔴 Users can't recover passwords |
| Email verification | 🟠 No email validation flow |
| Role-based access control | 🟠 All users have same permissions |
| Transaction update/edit | 🟠 Can't fix typos in transactions |
| Customer/transaction restore | 🟠 Can't undo soft deletes |
| Audit log | 🟠 No tracking of changes |
| API versioning | 🟢 No version strategy |
| Request ID tracking | 🟢 Hard to trace requests |

---

## Recommended Priority Order

1. **Fix JWT strategy to validate user** (Security — all endpoints are vulnerable)
2. **Add rate limiting** (Security — brute force protection)
3. **Fix CORS origin** (Security — prevents CSRF attacks)
4. **Fix transaction pagination** (Bug — currently broken)
5. **Add balance validation** (Bug — prevents MongoDB errors)
6. **Add user registration** (Feature — critical missing feature)
7. **Add transaction edit endpoint** (Feature — critical missing feature)
8. **Add MongoDB indexes** (Performance — will slow down as data grows)
9. **Add MongoDB transactions** (Data integrity — prevents partial writes)
10. **Add request logging** (Operations — can't debug without logs)

---

*End of report.*
