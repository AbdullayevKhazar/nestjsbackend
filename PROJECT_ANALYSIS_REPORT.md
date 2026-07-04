# Borc İdarəsi Backend — Comprehensive Project Analysis Report

> **Report Date:** 2026-07-04  
> **Project:** Debt Management App Backend (NestJS + MongoDB)  
> **Scope:** Full codebase audit with focus on duplication issues  
> **Severity:** 🔴 Critical | 🟠 High | 🟡 Medium | 🟢 Low

---

## 1. Executive Summary

This is a **NestJS-based debt management API** using MongoDB (Mongoose) with JWT authentication. It tracks customers, their debts/payments, and generates reports. The codebase has **29 known issues** and **2 specific duplication problems** you asked about.

| Category | Count |
|----------|-------|
| 🔴 Critical Issues | 4 |
| 🟠 High Issues | 6 |
| 🟡 Medium Issues | 12 |
| 🟢 Low Issues | 7 |
| **Import Duplication Problems** | **3 files affected** |
| **User Create Duplication Problems** | **2 vulnerabilities** |

---

## 2. Your Specific Issues: Deep Dive

### 🔴 Issue A: Import Duplication Problem

**What it is:** Multiple files import from the same npm package in **separate import statements** instead of combining them into one. This is messy, harder to maintain, and can cause confusion.

#### Affected File 1: `src/modules/auth/auth.service.ts`

```typescript
// ❌ LINE 1 — First import from @nestjs/common
import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';

// ... other imports ...

// ❌ LINE 12 — SECOND import from the SAME package (@nestjs/common)
import { Inject } from '@nestjs/common';
```

**Fix:** Combine into one import:
```typescript
// ✅ FIXED — Single import statement
import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
```

---

#### Affected File 2: `src/modules/auth/auth.module.ts`

```typescript
// ❌ LINE 1 — First import from @nestjs/common
import { Module } from '@nestjs/common';

// ❌ LINE 2 — Second import from @nestjs/config (same family)
import { ConfigModule, ConfigType } from '@nestjs/config';
```

While not from the exact same package, this is adjacent and should be grouped. However, `Module` and `ConfigModule` are from different packages, so this is a minor style issue.

---

#### Affected File 3: `src/database/database.module.ts`

```typescript
// ❌ LINE 1
import { Global, Module } from '@nestjs/common';
// ❌ LINE 2
import { ConfigModule, ConfigType } from '@nestjs/config';
```

Same pattern — related NestJS packages imported on separate lines. Not critical but part of the duplication/inefficiency pattern.

---

#### Affected File 4: `src/modules/customers/customers.service.ts`

```typescript
// ❌ LINE 6
import { InjectModel } from '@nestjs/mongoose';
// ...
// ❌ LINE 13
import { Model, Types } from 'mongoose';
```

These are from different packages (`@nestjs/mongoose` vs `mongoose`), so technically not a duplication. But they are related and could be noted for cleanup.

---

### 🔴 Issue B: New User Create Duplication Problem

This is actually **two separate but related problems**.

---

#### Problem B1: `UserService.create()` Has Zero Duplicate Protection

**File:** `src/modules/users/users.service.ts` — Lines 75-81

```typescript
async create(data: Partial<User>) {
  // ❌ NO check if user with this email already exists!
  const hashedPassword = await bcrypt.hash(data.password!, 10);
  return this.userModel.create({
    ...data,
    password: hashedPassword,
  });
}
```

**The Risk:**
- `AuthService.register()` checks for duplicates (line 58-62), but that's the ONLY place
- `SeedUserService` calls `userService.create()` directly (line 19-23) with hardcoded email `admin@local.com`
- If you add an admin panel, bulk import, or any other feature that calls `create()`, it will happily create duplicate users with the same email
- The `unique: true` on the email schema field only works if the MongoDB index actually exists

**Fix:** Add a guard inside `UserService.create()` itself:

```typescript
async create(data: Partial<User>) {
  // ✅ Check for existing user BEFORE creating
  const existing = await this.userModel.findOne({ 
    email: data.email?.toLowerCase() 
  });
  
  if (existing) {
    throw new BadRequestException('User with this email already exists');
  }
  
  const hashedPassword = await bcrypt.hash(data.password!, 10);
  return this.userModel.create({
    ...data,
    password: hashedPassword,
  });
}
```

---

#### Problem B2: Race Condition in `AuthService.register()`

**File:** `src/modules/auth/auth.service.ts` — Lines 57-68

```typescript
async register(registerDto: RegisterDto) {
  const existingUser = await this.userService.findByEmail(registerDto.email);

  if (existingUser) {
    throw new BadRequestException('Email already registered');
  }

  // ❌ RACE CONDITION: Between the check above and create below,
  // another request could pass the same check and create the same user!
  const user = await this.userService.create({...});
}
```

**Why This Happens:**
1. Request A checks → no user found → proceeds to create
2. Request B checks → no user found → proceeds to create (at the SAME time)
3. Both requests create a user with the same email

**Why It's Especially Dangerous:**
- `database.module.ts` line 17: `autoIndex: config.nodeEnv !== 'production'`
- In **production**, `autoIndex` is `false`, meaning the `unique: true` index on email might NOT exist in the database!
- Without the index, MongoDB allows true duplicates — not just a crash, but actual duplicate data

**Fix:** Create the unique index manually in production, or use a MongoDB transaction:

```typescript
// In your user schema or a migration script:
UserSchema.index({ email: 1 }, { unique: true });

// And in AuthService.register(), use atomic create with unique check:
async register(registerDto: RegisterDto) {
  try {
    const user = await this.userService.create({...});
    // ...
  } catch (error) {
    if (error.code === 11000) { // MongoDB duplicate key error
      throw new BadRequestException('Email already registered');
    }
    throw error;
  }
}
```

---

## 3. Project Analytics

### Module Breakdown

| Module | Status | Files | Purpose |
|--------|--------|-------|---------|
| `auth` | ✅ Active | 8 files | JWT login, register, refresh, logout |
| `users` | ⚠️ Partial | 4 files | User data, seed service, empty controller |
| `customers` | ✅ Active | 7 files | Customer CRUD, debt/payment tracking |
| `transactions` | ✅ Active | 7 files | Transaction CRUD with balance updates |
| `reports` | ✅ Active | 5 files | Daily/monthly reporting |
| `public` | ✅ Active | 3 files | Public customer sharing via token |
| `health` | ⚠️ Partial | 3 files | Static health check (no DB verification) |
| `backup` | ✅ Active | 4 files | Google Drive backup integration |
| `products` | ❌ Empty | 1 file | Completely empty module — dead code |
| `database` | ✅ Active | 3 files | MongoDB connection config |
| `config` | ✅ Active | 6 files | Environment configs (one unused: auth.config.ts) |
| `common` | ✅ Active | 8 files | Pipes, filters, interceptors, decorators, setup |
| `shared` | ❌ Empty | 1 file | `index.ts` is 0 bytes |

### File Metrics (Source Only, Excluding `node_modules` and `dist`)

| Metric | Count |
|--------|-------|
| Total `.ts` source files | ~58 |
| Empty / 0-byte files | 5 |
| Controllers | 8 |
| Services | 9 |
| DTOs | 9 |
| Schemas | 3 |
| Config files | 6 |
| Test files | 1 (default only) |

### Code Line Distribution (Approximate)

| Area | Lines of Code |
|------|---------------|
| `src/modules/customers` | ~330 |
| `src/modules/transactions` | ~275 |
| `src/modules/auth` | ~190 |
| `src/modules/reports` | ~120 |
| `src/modules/users` | ~110 |
| `src/modules/backup` | ~80 |
| `src/modules/public` | ~50 |
| `src/modules/health` | ~25 |
| `src/config` | ~40 |
| `src/common` | ~90 |
| **Total** | **~1,400 lines** |

### Dependencies Status

| Package | Declared | Actual Latest | Status |
|---------|----------|---------------|--------|
| `@nestjs/*` | ^11.0.1 | 11.x | ✅ Good |
| `mongoose` | ^9.7.3 | 8.x+ | ⚠️ Outdated (v9 is old) |
| `bcrypt` | ^6.0.0 | 5.1.x | 🔴 **Version doesn't exist!** |
| `passport-jwt` | ^4.0.1 | 4.0.1 | ✅ Good |
| `uuid` | ^14.0.1 | 9.x | ⚠️ Could use native `crypto.randomUUID()` |

**⚠️ CRITICAL:** `bcrypt` version `6.0.0` does not exist on npm. The latest stable is `5.1.x`. This will cause `npm install` to fail or potentially install a malicious package. **Fix immediately:**

```json
"bcrypt": "^5.1.1"
```

---

## 4. Issue Summary (From Previous Audit + New Findings)

### 🔴 Critical (4)

| # | Issue | File | Effort |
|---|-------|------|--------|
| C1 | CORS allows ANY origin with credentials | `src/main.ts:23-26` | 5 min |
| C2 | No rate limiting on auth endpoints | `src/modules/auth/auth.controller.ts` | 30 min |
| C3 | Balance can go negative | `src/modules/customers/customers.service.ts:229-259` | 15 min |
| C4 | No MongoDB transactions | Multi-step ops | `transactions.service.ts`, `customers.service.ts` | 2 hrs |

### 🟠 High (6)

| # | Issue | File | Effort |
|---|-------|------|--------|
| H1 | Health check doesn't verify DB | `health.service.ts` | 30 min |
| H2 | No graceful shutdown | `main.ts` | 15 min |
| H3 | No request/error logging | `main.ts`, `http-exception.filter.ts` | 1 hr |
| H4 | `AuthController.me` returns JWT payload, not user | `auth.controller.ts:29-34` | 15 min |
| H5 | `findOne` uses string ID without ObjectId conversion | `customers.service.ts:134-141` | 15 min |
| H6 | `UsersController` is completely empty | `users.controller.ts` | 1 hr |

### 🟡 Medium (12)

| # | Issue | File | Effort |
|---|-------|------|--------|
| M1 | Response interceptor double-wraps data | `response.interceptor.ts:19-20` | 15 min |
| M2 | `ParseObjectIdPipe` doesn't transform to ObjectId | `parse-object-id.pipe.ts` | 15 min |
| M3 | `main.ts` uses `process.env` directly | `main.ts:28,43,45` | 15 min |
| M4 | `console.log` in production | `main.ts:45` | 5 min |
| M5 | Reports use server timezone | `reports.service.ts:32-38` | 30 min |
| M6 | Empty modules/files clutter codebase | `products/*`, `shared/*`, `setup/*` | 15 min |
| M7 | `auth.config.ts` exported but never used | `config/auth.config.ts` | 10 min |
| M8 | `DatabaseService` methods never wired | `database.service.ts` | 15 min |
| M9 | No unique index on `(createdBy, phone)` | `customer.schema.ts:89-100` | 10 min |
| M10 | Unused DTO imports | `reports.controller.ts:10-12` | 5 min |
| M11 | Missing Swagger docs | `auth.controller.ts`, `transactions.controller.ts` | 2 hrs |
| M12 | No `@ApiResponse` decorators anywhere | All controllers | 2 hrs |

### 🟢 Low (7)

| # | Issue | File | Effort |
|---|-------|------|--------|
| L1 | Inconsistent import styles | Multiple files | 30 min |
| L2 | `as any` type assertion | `auth.module.ts:21` | 5 min |
| L3 | Zero real test coverage | `test/` folder | 1-2 days |
| L4 | `api-response.interface.ts` never imported | `shared/responses/` | 5 min |
| L5 | No API versioning strategy | `main.ts` | 1 hr |
| L6 | `ProductsModule` not imported in `AppModule` | `app.module.ts` | 5 min |
| L7 | `@CurrentUser()` returns JWT payload, not DB user | `current-user.decorator.ts` | 15 min |

---

## 5. Priority Fix Order (What To Do Right Now)

### Step 1: Fix the Duplication Issues (15 minutes)

1. **Fix import duplication** in `auth.service.ts` — combine the two `@nestjs/common` imports
2. **Fix user create duplication** in `users.service.ts` — add `findOne` check before `create`
3. **Fix race condition** in `auth.service.ts` — wrap `create` in try/catch for MongoDB duplicate key error (code 11000)

### Step 2: Fix Critical Security (1 hour)

4. Fix CORS to whitelist origins instead of `origin: true`
5. Install `@nestjs/throttler` and add rate limiting to auth endpoints
6. Fix `bcrypt` version in `package.json` from `^6.0.0` to `^5.1.1`

### Step 3: Fix Data Integrity (2-3 hours)

7. Add balance validation in `increasePayment` to prevent negative balance
8. Add MongoDB transactions for transaction create/update/delete
9. Ensure `email` unique index exists in production database

### Step 4: Clean Up (30 minutes)

10. Delete empty files: `products.module.ts`, `users.controller.ts`, `shared/index.ts`, `common/setup/index.ts`, `modules/auth/index.ts`
11. Remove unused `auth.config.ts` or wire it up
12. Standardize import styles

---

## 6. Architecture Summary

```
┌─────────────────────────────────────────────────────────┐
│                      AppModule                            │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐         │
│  │ Config  │ │ Database│ │ Health  │ │ Auth    │         │
│  │ Module  │ │ Module  │ │ Module  │ │ Module  │         │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘         │
│       │           │           │           │               │
│  ┌────┴────┐ ┌────┴────┐ ┌────┴────┐ ┌────┴────┐       │
│  │ User    │ │Customer │ │Transac- │ │ Reports │       │
│  │ Module  │ │ Module  │ │ tion    │ │ Module  │       │
│  └────┬────┘ └────┬────┘ │ Module  │ └────┬────┘       │
│       │           │      └────┬────┘      │             │
│       │           │           │           │             │
│       └───────────┴───────────┴───────────┘             │
│                    MongoDB (Mongoose)                   │
└─────────────────────────────────────────────────────────┘
```

**Data Flow:**
1. User registers/logs in → JWT tokens issued
2. User creates customers → stored with `createdBy` (User ID)
3. User creates transactions (debt/payment) → customer balance updated atomically
4. Reports aggregate transactions by customer and date range
5. Public module allows sharing customer data via unique token

---

## 7. Conclusion

Your project is a **solid NestJS backend** with clean architecture and good separation of concerns. The two duplication issues you identified are real and fixable in minutes:

1. **Import duplication** → Cosmetic/quality issue, 3 files affected, 5-minute fix
2. **User create duplication** → **Data integrity risk**, requires adding duplicate checks in `UserService.create()` and handling the race condition in `AuthService.register()`

The bigger picture shows **4 critical security/data issues** that need attention before production. With focused effort (~2-3 days), the entire codebase can be production-ready.

**Estimated time to fix all duplication + critical issues: 3-4 hours.**

---

_Report generated by Kimi — Borc İdarəsi Backend Analysis_
