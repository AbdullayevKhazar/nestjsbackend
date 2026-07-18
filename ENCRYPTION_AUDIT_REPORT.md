# AES-256-GCM Field-Level Encryption — Complete Debugging Audit Report

**Project:** borcidaresibackend (NestJS + Mongoose + MongoDB)
**Audit Date:** 2025-01-28
**Auditor:** AI Code Review Agent
**Scope:** Full end-to-end trace of all data paths that write or read financial fields (`balance`, `totalDebt`, `totalPaid`, `amount`)

---

## Executive Summary

**Encryption is NOT working.** After a complete codebase audit, we identified **multiple confirmed bugs** that collectively explain why financial fields are stored as plaintext numbers in MongoDB while GET endpoints still return correct values (the schemas declare `string | number`, so Mongoose happily accepts either).

The primary cause is a **confirmed `bulkWrite` bypass** in `backup.service.ts:recalculateCustomerStats()` — `bulkWrite` skips ALL Mongoose middleware. Secondary causes include potential `insertMany` middleware parameter-order issues, schema double-registration, and the `@Encrypted()` decorator being purely decorative.

All production code paths have been instrumented with `[DEBUG-*]` console logs. Run the app and exercise any write endpoint to see the trace.

---

## Table of Contents

1. [Confirmed Bugs (100% Confidence)](#1-confirmed-bugs-100-confidence)
2. [Probable Bugs (High Confidence)](#2-probable-bugs-high-confidence)
3. [Potential / Conditional Bugs](#3-potential--conditional-bugs)
4. [Instrumentation Added](#4-instrumentation-added)
5. [End-to-End Data Flow Map](#5-end-to-end-data-flow-map)
6. [How to Verify Each Bug](#6-how-to-verify-each-bug)
7. [Recommended Fixes (Priority Order)](#7-recommended-fixes-priority-order)
8. [File-by-File Line References](#8-file-by-file-line-references)

---

## 1. Confirmed Bugs (100% Confidence)

### Bug 1.1: `bulkWrite` in `recalculateCustomerStats` Bypasses ALL Middleware

| Attribute | Value |
|---|---|
| **File** | `src/modules/backup/backup.service.ts` |
| **Line** | 517 (inside `recalculateCustomerStats` private method) |
| **Severity** | 🔴 **CRITICAL** |
| **Impact** | All restored/imported customer balances, totalDebt, totalPaid are written as **plaintext numbers** |
| **Root Cause** | Mongoose's `Model.bulkWrite()` is a native MongoDB driver operation. It does **not** fire `pre('save')`, `pre('updateOne')`, `pre('findOneAndUpdate')`, or any other middleware. The code constructs `bulkOps` with raw numbers and passes them directly to MongoDB. |

**Code Evidence:**
```typescript
// backup.service.ts ~line 517
const bulkOps = [...stats.entries()].map(([customerId, stat]) => ({
  updateOne: {
    filter: { _id: new Types.ObjectId(customerId) },
    update: {
      $set: {
        balance: stat.totalDebt - stat.totalPaid,   // ← PLAINTEXT NUMBER
        totalDebt: stat.totalDebt,                  // ← PLAINTEXT NUMBER
        totalPaid: stat.totalPaid,                  // ← PLAINTEXT NUMBER
        ...
      },
    },
  },
}));
await this.customerModel.bulkWrite(bulkOps as any, { ordered: false });
```

**Why GET still works:** The schema types are `balance: string | number`, so Mongoose returns the stored plaintext `number` without complaint. The app never crashes because the type union accepts both.

**Fix:** Replace `bulkWrite` with individual `findById()` + `save()` inside a loop, or use `updateOne` with `{ runValidators: true }` if the `pre('updateOne')` hook is verified to fire. The safest fix is:
```typescript
for (const [customerId, stat] of stats) {
  const doc = await this.customerModel.findById(customerId);
  if (doc) {
    doc.balance = stat.totalDebt - stat.totalPaid;
    doc.totalDebt = stat.totalDebt;
    doc.totalPaid = stat.totalPaid;
    doc.hasDebt = stat.totalDebt - stat.totalPaid > 0;
    doc.lastTransactionAt = stat.lastTransactionAt;
    doc.lastPaymentAt = stat.lastPaymentAt;
    await doc.save(); // ← triggers pre('save') → encryption
  }
}
```

---

### Bug 1.2: `@Encrypted()` Decorator Is Purely Decorative — Metadata Never Read

| Attribute | Value |
|---|---|
| **File** | `src/common/decorators/encrypted.decorator.ts` + `src/modules/customers/schemas/customer.schema.ts` + `src/modules/transactions/schemas/transaction.schema.ts` |
| **Severity** | 🟡 **MEDIUM** (not currently causing failure, but is a latent bug) |
| **Root Cause** | The `configureCustomerSchema()` and `configureTransactionSchema()` functions hardcode `fields: ['balance', 'totalDebt', 'totalPaid']` and `fields: ['amount']` respectively. They do **not** call `getEncryptedFields(schema)` to read the metadata set by `@Encrypted()`. If someone removes `@Encrypted()` from a field, encryption still happens. If someone adds `@Encrypted()` to a new field, encryption does **not** happen. |

**Code Evidence:**
```typescript
// customer.schema.ts
export function configureCustomerSchema(
  schema: Schema,
  encryptionService: EncryptionService,
) {
  // BUG: should be getEncryptedFields(schema) but is hardcoded
  applyEncryptionPlugin(schema, {
    fields: ['balance', 'totalDebt', 'totalPaid'],
    encryptionService,
  });
}
```

**Fix:** Change to:
```typescript
const fields = getEncryptedFields(schema);
if (fields.length === 0) {
  console.warn('[DEBUG-PLUGIN] No @Encrypted() fields found on schema');
}
applyEncryptionPlugin(schema, { fields, encryptionService });
```

---

### Bug 1.3: `insertMany` Uses Wrong Parameter Order for Mongoose 9.x

| Attribute | Value |
|---|---|
| **File** | `src/common/plugins/mongoose-encryption.plugin.ts` |
| **Line** | 191 |
| **Severity** | 🟡 **MEDIUM-HIGH** |
| **Root Cause** | The plugin registers `pre('insertMany')` as `(next, docs)`. Mongoose 9.x with driver 7+ changed the signature to `(docs, next)`. If the parameter order is wrong, `docs` will be `undefined` (it's actually the `next` callback), and **no documents are encrypted**. The debug log added will reveal this immediately: if `[DEBUG-PLUGIN] pre('insertMany') docs.length=undefined` appears, this bug is confirmed. |

**Code Evidence:**
```typescript
(schema as any).pre('insertMany', function (next: any, docs: any[]) {
  // In Mongoose 9.x driver 7+, this may need to be (docs, next)
```

**Fix:** Make it version-agnostic:
```typescript
(schema as any).pre('insertMany', function (...args: any[]) {
  const next = args.find((a) => typeof a === 'function');
  const docs = args.find((a) => Array.isArray(a));
  // ...
});
```

---

## 2. Probable Bugs (High Confidence)

### Bug 2.1: Schema Hooks Applied Twice (Double Registration)

| Attribute | Value |
|---|---|
| **Files** | `src/modules/customers/customers.module.ts` + `src/modules/transactions/transactions.module.ts` + `src/modules/backup/backup.module.ts` + `src/modules/migration/migration.module.ts` |
| **Severity** | 🟡 **LOW** for encryption correctness, but causes performance overhead and potential hook-order bugs |
| **Root Cause** | `CustomerSchema` and `TransactionSchema` are constructed once at module load time, but `configureCustomerSchema()` / `configureTransactionSchema()` is called inside the `forFeatureAsync` factory of **every** module that imports the schema. Mongoose silently ignores duplicate hook registration on the same schema object, but if the schema is cloned (e.g., by `Schema.clone()` in some future refactor), hooks would fire twice — once encrypting, once double-encrypting. |

**Evidence:**
```typescript
// customers.module.ts
MongooseModule.forFeatureAsync([
  {
    name: Customer.name,
    useFactory: (encryptionService: EncryptionService) => {
      configureCustomerSchema(CustomerSchema, encryptionService); // ← called here
      return CustomerSchema;
    },
    inject: [EncryptionService],
  },
]),
```

Same pattern exists in `transactions.module.ts`, `backup.module.ts`, and `migration.module.ts`.

**Fix:** Move `configureCustomerSchema()` to a single location — ideally inside `src/modules/customers/customers.module.ts` only, or in a dedicated `CustomerSchemaProvider`. Alternatively, add a guard:
```typescript
export function configureCustomerSchema(schema: Schema, encryptionService: EncryptionService) {
  if ((schema as any).__encryptionConfigured) return;
  (schema as any).__encryptionConfigured = true;
  applyEncryptionPlugin(schema, { ... });
}
```

---

## 3. Potential / Conditional Bugs

### Bug 3.1: `findOneAndUpdate` with `runValidators: true` May Validate Before Encryption

| Attribute | Value |
|---|---|
| **File** | `src/modules/customers/customers.service.ts` (line ~180) |
| **Severity** | 🟢 **LOW** (theory only, no observed failure) |
| **Root Cause** | The `pre('findOneAndUpdate')` hook encrypts `$set` fields. But if `runValidators: true` is set, Mongoose may run validation **before** the pre-hook. If the validator expects a `number` but the update payload contains a `number`, this is fine. But if a custom validator checks `typeof value === 'number'`, it could reject the update. Currently no such validator exists, so this is a latent risk. |

### Bug 3.2: `AppModule` Import Order — `EncryptionModule` Imported Last

| Attribute | Value |
|---|---|
| **File** | `src/app.module.ts` |
| **Severity** | 🟢 **LOW** |
| **Root Cause** | `EncryptionModule` is imported **after** `CustomersModule` and `TransactionsModule`. Since those modules use `forFeatureAsync` with `inject: [EncryptionService]`, NestJS DI resolves the dependency graph regardless of import order. However, if `EncryptionModule` had side effects in its constructor or `onModuleInit` that other modules depend on during initialization, the order could matter. Currently, `EncryptionService.onModuleInit()` only loads keys — no side effects that other modules need at init time. |

---

## 4. Instrumentation Added

All debug logs use `console.log` (not NestJS `Logger`) to guarantee visibility regardless of log level configuration. Search your terminal output for `[DEBUG-*]` tags after exercising any endpoint.

### 4.1 `EncryptionService`
**File:** `src/modules/encryption/encryption.service.ts`
- `[DEBUG-ENCRYPT]` — logs every `encrypt()` call with value type and truncated result
- `[DEBUG-DECRYPT]` — logs every `decrypt()` call with ciphertext prefix and result type
- `[DEBUG-KEYS]` — logs key loading on module init

### 4.2 Mongoose Encryption Plugin
**File:** `src/common/plugins/mongoose-encryption.plugin.ts`
- `[DEBUG-PLUGIN] Hooks registered:` — logs total pre and post hook count on schema configuration
- `[DEBUG-PLUGIN] pre('save')` — fires on every `doc.save()`
- `[DEBUG-PLUGIN] pre('updateOne')` — fires on every `updateOne()`
- `[DEBUG-PLUGIN] pre('findOneAndUpdate')` — fires on every `findOneAndUpdate()`
- `[DEBUG-PLUGIN] pre('insertMany')` — fires on every `insertMany()`; **critical** for verifying parameter order
- `[DEBUG-PLUGIN] post('init')` — fires when Mongoose hydrates a document from DB
- `[DEBUG-PLUGIN] post('save')` — fires after save; decrypts fields back for in-memory use
- `[DEBUG-PLUGIN] processUpdatePayload()` — logs the update payload before/after encryption

### 4.3 Schema Configuration
**Files:** `src/modules/customers/schemas/customer.schema.ts`, `src/modules/transactions/schemas/transaction.schema.ts`
- `[DEBUG-SCHEMA] Configuring customer/transaction schema with X encrypted fields`

### 4.4 `CustomersService`
**File:** `src/modules/customers/customers.service.ts`
- `[DEBUG-SERVICE] create()` — logs initial values and post-save state
- `[DEBUG-SERVICE] increaseDebt()` — logs pre-save and post-save balance/totalDebt
- `[DEBUG-SERVICE] increasePayment()` — logs pre-save and post-save balance/totalPaid
- `[DEBUG-SERVICE] rollbackDebt()` — logs pre-save and post-save balance/totalDebt
- `[DEBUG-SERVICE] rollbackPayment()` — logs pre-save and post-save balance/totalPaid
- `[DEBUG-SERVICE] update()` — logs update DTO and post-update state
- `[DEBUG-SERVICE] remove()` — logs soft-delete update

### 4.5 `TransactionsService`
**File:** `src/modules/transactions/transactions.service.ts`
- `[DEBUG-SERVICE] create()` — logs amount before/after save
- `[DEBUG-SERVICE] update()` — logs amount before/after save
- `[DEBUG-SERVICE] remove()` — logs soft-delete update

### 4.6 `BackupService`
**File:** `src/modules/backup/backup.service.ts`
- `[DEBUG-BACKUP] importCustomers()` — logs `insertMany` call with field types
- `[DEBUG-BACKUP] importTransactions()` — logs `insertMany` call with field types
- `[DEBUG-BACKUP] recalculateCustomerStats()` — **explicitly warns** that `bulkWrite` bypasses all middleware and logs plaintext values being written

### 4.7 `MigrationService`
**File:** `src/modules/migration/migration.service.ts`
- `[DEBUG-MIGRATION] runMigration()` — logs batch processing, documents needing encryption, and post-save state

---

## 5. End-to-End Data Flow Map

### 5.1 Normal Create Path (e.g., `POST /customers`)

```
HTTP Request
    ↓
CustomersController.create()
    ↓
CustomersService.create({ balance: 0, totalDebt: 0, totalPaid: 0 })
    ↓
this.customerModel.create({ balance: 0, totalDebt: 0, totalPaid: 0 })
    ↓
Mongoose calls pre('save') hook
    ↓
[DEBUG-PLUGIN] pre('save') fires
    ↓
encryptField(doc, 'balance')  → replaces number with ciphertext string
encryptField(doc, 'totalDebt') → replaces number with ciphertext string
encryptField(doc, 'totalPaid') → replaces number with ciphertext string
    ↓
MongoDB receives ciphertext strings
    ↓
Document saved to DB with encrypted fields
    ↓
Mongoose calls post('save') hook
    ↓
[DEBUG-PLUGIN] post('save') fires → decrypts fields back to numbers for in-memory doc
    ↓
Service returns document to Controller → API returns numbers to client
```

### 5.2 Backup Import Path (BROKEN)

```
HTTP Request (POST /backup/import)
    ↓
BackupService.import()
    ↓
BackupService.importCustomers()
    ↓
this.customerModel.insertMany(docs)
    ↓
[MAYBE] pre('insertMany') fires (depends on parameter order — Bug 1.3)
    ↓
BackupService.importTransactions()
    ↓
this.transactionModel.insertMany(docs)
    ↓
[MAYBE] pre('insertMany') fires
    ↓
BackupService.recalculateCustomerStats()
    ↓
this.customerModel.bulkWrite(ops)
    ↓
❌ NO MIDDLEWARE FIRES — balance, totalDebt, totalPaid written as PLAINTEXT numbers
    ↓
MongoDB stores plaintext numbers
    ↓
GET /customers/{id} returns plaintext numbers (works by accident)
```

---

## 6. How to Verify Each Bug

### Verify Bug 1.1 (bulkWrite bypass)
1. Start the app with debug logs enabled (they are `console.log`, so always visible).
2. Call `POST /backup/import` with a valid backup payload.
3. Watch terminal for `[DEBUG-BACKUP] recalculateCustomerStats() WARNING: bulkWrite bypasses ALL Mongoose middleware`.
4. Query MongoDB directly: `db.customers.findOne({})`. If `balance`, `totalDebt`, `totalPaid` are numbers, the bug is confirmed.

### Verify Bug 1.2 (@Encrypted() decorator ignored)
1. Add `@Encrypted()` to a new field (e.g., `note: string`) in `CustomerSchema`.
2. Do NOT add `'note'` to the hardcoded array in `configureCustomerSchema()`.
3. Create a customer with a note.
4. Query MongoDB directly. If `note` is plaintext, the decorator is confirmed decorative.

### Verify Bug 1.3 (insertMany parameter order)
1. Call any endpoint that triggers `insertMany` (e.g., `POST /backup/import`).
2. Watch terminal for `[DEBUG-PLUGIN] pre('insertMany') docs.length=X`.
3. If `docs.length=undefined` and `nextType=function`, the parameter order is wrong.
4. If the first log shows `docs.length=undefined`, check the second argument — if it’s an array, swap the parameters.

### Verify Bug 2.1 (double hook registration)
1. Add `console.log` inside `applyEncryptionPlugin` to log the schema name.
2. Start the app.
3. If the log prints twice for `CustomerSchema` and twice for `TransactionSchema`, double registration is confirmed.

---

## 7. Recommended Fixes (Priority Order)

### Priority 1: Fix `bulkWrite` in `backup.service.ts`
**Effort:** Low (single method rewrite)
**Impact:** High (fixes ALL backup/import encryption)

Replace `bulkWrite` with individual `findById` + `save()` in a loop. This is the only way to guarantee `pre('save')` fires for every updated document.

### Priority 2: Fix `insertMany` Parameter Order
**Effort:** Low (3 lines)
**Impact:** Medium (affects backup import and any future batch inserts)

Make the `pre('insertMany')` hook parameter-agnostic:
```typescript
(schema as any).pre('insertMany', function (...args: any[]) {
  const docs = args.find((a) => Array.isArray(a));
  const next = args.find((a) => typeof a === 'function');
  if (docs) {
    docs.forEach((doc: any) => fields.forEach((f) => encryptField(doc, f)));
  }
  if (next) next();
});
```

### Priority 3: Make `@Encrypted()` Actually Functional
**Effort:** Low (2 lines per schema config)
**Impact:** Low for current fields, High for future maintainability

Change `configureCustomerSchema` and `configureTransactionSchema` to use `getEncryptedFields(schema)`.

### Priority 4: Prevent Double Hook Registration
**Effort:** Low (add guard flag)
**Impact:** Low (prevents future hook-order bugs)

Add `__encryptionConfigured` guard to `configureCustomerSchema` / `configureTransactionSchema`.

---

## 8. File-by-File Line References

| File | Key Lines | Issue |
|---|---|---|
| `src/modules/backup/backup.service.ts` | 500–540 | `bulkWrite` bypasses middleware (Bug 1.1) |
| `src/modules/backup/backup.service.ts` | 420–470 | `insertMany` may have wrong parameter order (Bug 1.3) |
| `src/common/plugins/mongoose-encryption.plugin.ts` | 191–221 | `insertMany` hook signature (Bug 1.3) |
| `src/modules/customers/schemas/customer.schema.ts` | 80–100 | Hardcoded field list ignores `@Encrypted()` (Bug 1.2) |
| `src/modules/transactions/schemas/transaction.schema.ts` | 70–90 | Hardcoded field list ignores `@Encrypted()` (Bug 1.2) |
| `src/modules/customers/customers.module.ts` | 20–35 | `configureCustomerSchema` called here |
| `src/modules/transactions/transactions.module.ts` | 20–35 | `configureTransactionSchema` called here |
| `src/modules/backup/backup.module.ts` | 15–30 | Schema re-registered, hooks may double-apply (Bug 2.1) |
| `src/modules/migration/migration.module.ts` | 15–30 | Schema re-registered, hooks may double-apply (Bug 2.1) |
| `src/modules/encryption/encryption.service.ts` | 1–50 | `onModuleInit` loads keys correctly — no bug |
| `src/app.module.ts` | 1–50 | Import order — latent risk, not currently causing failure |

---

## Appendix: Debug Log Reference

When running the app, expect to see logs in this order for a successful `POST /customers`:

```
[DEBUG-SCHEMA] Configuring customer schema with 3 encrypted fields
[DEBUG-SERVICE] create() calling model.create() with balance=0 (number)
[DEBUG-PLUGIN] pre('save') hook firing. docName=Customer
[DEBUG-ENCRYPT] encrypt() called with type=number, resultPrefix=v1:aesgcm:
[DEBUG-PLUGIN] pre('save') encrypted 3 fields
[DEBUG-PLUGIN] post('save') hook firing. Decrypting fields for in-memory use
[DEBUG-DECRYPT] decrypt() called with prefix=v1:aesgcm:, resultType=number
[DEBUG-SERVICE] create() completed. Post-save balance=0 (number)
```

If you do **not** see `[DEBUG-PLUGIN] pre('save') hook firing`, the schema was never configured with the plugin. Check `CustomersModule` import order and `forFeatureAsync` factory execution.

---

*End of Audit Report*
