# Financial Data Encryption Architecture

## Overview

This backend has been redesigned to provide **maximum confidentiality** for all financial information using **AES-256-GCM application-level encryption**. No one with direct MongoDB access — including database administrators, backup operators, or anyone using MongoDB Compass — can read any financial data.

Only the authenticated backend application code can decrypt and use the information.

---

## Core Architecture

### 1. Encryption Layer

- **Algorithm**: AES-256-GCM
- **Key Derivation**: SHA-256 (any-length ENCRYPTION_KEY → 32-byte key)
- **IV**: 16-byte random per-field
- **Authentication**: GCM auth tag for integrity & tamper detection
- **Format**: `v{version}:{base64(iv)}:{base64(tag)}:{base64(ciphertext)}`

**Files**:
- `src/modules/encryption/encryption.service.ts`
- `src/modules/encryption/encryption.module.ts`
- `src/config/encryption.config.ts`

### 2. Transparent Field-Level Encryption

The `@Encrypted()` decorator marks schema fields for automatic encryption/decryption. The Mongoose plugin handles all CRUD operations transparently — business logic never calls `encrypt()` or `decrypt()` manually.

**Files**:
- `src/common/decorators/encrypted.decorator.ts`
- `src/common/plugins/mongoose-encryption.plugin.ts`

### 3. Encrypted Fields

| Entity | Fields Encrypted |
|--------|-----------------|
| Customer | `balance`, `totalDebt`, `totalPaid` |
| Transaction | `amount` |
| FinancialEvent | `amount`, `balanceSnapshot`, `totalDebtSnapshot`, `totalPaidSnapshot` |
| DailySummary | `totalDebtAdded`, `totalPaymentReceived`, `netChange` |
| CustomerSnapshot | `balance`, `totalDebt`, `totalPaid` |

### 4. Querying Strategy

Since encrypted fields cannot be used in MongoDB queries (`$gt`, `$sum`, `$inc`), we use:

- **`hasDebt` boolean flag**: Non-encrypted index for filtering customers with debt
- **Application-level aggregation**: Fetch documents, decrypt in memory, compute totals
- **Read-model projections**: Pre-computed encrypted snapshots for fast reports

---

## CQRS + Event Sourcing for Reports

Because MongoDB cannot aggregate encrypted fields, we implement a **Command Query Responsibility Segregation (CQRS)** architecture with an **event store** and **read-model projections**.

### Event Store (`FinancialEvent`)

Every financial mutation emits an immutable event:
- `debt_increased`
- `payment_increased`
- `debt_rolled_back`
- `payment_rolled_back`
- `transaction_created`
- `transaction_updated`
- `transaction_deleted`

**Benefits**:
- Complete audit trail
- Ability to rebuild any customer state or report from scratch
- Compliance with financial data retention requirements

**Files**:
- `src/modules/events/schemas/financial-event.schema.ts`
- `src/modules/events/financial-events.service.ts`
- `src/modules/events/financial-events.module.ts`

### Read-Model Projections

Two projection collections store pre-computed encrypted aggregates:

1. **CustomerSnapshot**: Per-customer financial state (`balance`, `totalDebt`, `totalPaid`, `hasDebt`)
2. **DailySummary**: Per-day aggregated totals per user

**Benefits**:
- Reports are fast (no aggregating all transactions at query time)
- Values remain encrypted at rest
- Queries use only non-encrypted dimensions (`userId`, `date`, `hasDebt`)

**Files**:
- `src/modules/reports/schemas/customer-snapshot.schema.ts`
- `src/modules/reports/schemas/daily-summary.schema.ts`
- `src/modules/reports/report-projections.service.ts`

---

## Key Rotation Support

The `EncryptionService` supports multiple key versions simultaneously:

1. **Load old key**: `loadKey('1', process.env.ENCRYPTION_KEY_OLD)`
2. **Load new key**: `loadKey('2', process.env.ENCRYPTION_KEY_NEW)`
3. **Set new as latest**: `setLatestVersion('2')`
4. **Re-encrypt existing data**: `rotateEncryption(encryptedValue)`

All existing encrypted data (with older versions) remains decryptable. New writes use the latest version.

---

## Migration from Plaintext

**Endpoint**: `POST /migration/encrypt-plaintext`

The migration service:
1. Iterates all customers and transactions in batches
2. Detects plaintext financial fields (not matching the encrypted format)
3. Re-saves documents so the encryption plugin converts them to ciphertext
4. Is **idempotent** — safe to run multiple times

**Verification endpoint**: `POST /migration/verify`

---

## Security Guarantees

| Threat | Mitigation |
|--------|-----------|
| Database admin reads data | All financial values are AES-256-GCM ciphertext |
| Backup leak | Backups contain only encrypted values |
| MongoDB Compass access | Fields show as unreadable strings like `v1:abc123...` |
| Insider with DB access | Cannot decrypt without the application key |
| Network sniffing | HTTPS in transit + encryption at rest |
| Tampering | GCM authentication tag detects any ciphertext modification |

---

## Business Logic Changes

### Before (plaintext)
```typescript
await customerModel.updateOne(
  { _id: customerId },
  { $inc: { balance: amount, totalDebt: amount } }
);
```

### After (encrypted)
```typescript
const customer = await customerModel.findOne({ _id: customerId });
const currentBalance = encryptionService.decrypt<number>(customer.balance);
const currentTotalDebt = encryptionService.decrypt<number>(customer.totalDebt);

customer.balance = currentBalance + amount;
customer.totalDebt = currentTotalDebt + amount;
customer.hasDebt = customer.balance > 0;
await customer.save(); // plugin encrypts automatically
```

### Reports
Before: MongoDB `$sum` aggregation on plaintext fields.
After: Application-level aggregation after plugin decrypts fields.

---

## Environment Variables

```env
ENCRYPTION_KEY=your-very-strong-secret-key-min-8-chars
ENCRYPTION_KEY_VERSION=1
```

For key rotation:
```env
ENCRYPTION_KEY_OLD=previous-secret-key
ENCRYPTION_KEY_NEW=new-secret-key
```

---

## Files Created / Modified

### New Files
- `src/common/decorators/encrypted.decorator.ts`
- `src/common/interfaces/encryption-options.interface.ts`
- `src/modules/events/schemas/financial-event.schema.ts`
- `src/modules/events/financial-events.service.ts`
- `src/modules/events/financial-events.module.ts`
- `src/modules/reports/schemas/daily-summary.schema.ts`
- `src/modules/reports/schemas/customer-snapshot.schema.ts`
- `src/modules/reports/report-projections.service.ts`
- `src/modules/migration/migration.service.ts`
- `src/modules/migration/migration.controller.ts`
- `src/modules/migration/migration.module.ts`

### Modified Files
- `src/modules/encryption/encryption.service.ts` — enhanced with key rotation, multi-version support
- `src/common/plugins/mongoose-encryption.plugin.ts` — production-grade transparent encryption
- `src/modules/customers/schemas/customer.schema.ts` — `@Encrypted()` fields + `hasDebt` flag
- `src/modules/transactions/schemas/transaction.schema.ts` — `@Encrypted()` amount field
- `src/modules/customers/customers.service.ts` — read-modify-save pattern + event emission + projections
- `src/modules/transactions/transactions.service.ts` — read-modify-save + projection updates
- `src/modules/reports/reports.service.ts` — application-level aggregation + encrypted projections
- `src/modules/public/public.service.ts` — decrypt for public API responses
- `src/modules/backup/backup.service.ts` — decrypt on export, encrypt on import
- `src/modules/customers/customers.module.ts` — async schema configuration with encryption
- `src/modules/transactions/transactions.module.ts` — async schema configuration with encryption
- `src/modules/reports/reports.module.ts` — added projection models
- `src/modules/public/public.module.ts` — async schema configuration
- `src/modules/backup/backup.module.ts` — async schema configuration
- `src/app.module.ts` — added FinancialEventsModule and MigrationModule

---

## Production Checklist

- [ ] Set a strong `ENCRYPTION_KEY` (32+ random characters recommended)
- [ ] Run `POST /migration/encrypt-plaintext` to encrypt existing data
- [ ] Verify with `POST /migration/verify`
- [ ] Store `ENCRYPTION_KEY` in a secure vault (not in `.env` on servers)
- [ ] Rotate keys periodically using the built-in key rotation API
- [ ] Monitor `hasDebt` flag consistency (auto-maintained by services)
- [ ] Back up event store for audit compliance
