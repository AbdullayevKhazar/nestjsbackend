import { EncryptionService } from '../../encryption/encryption.service';
import type {
  RawCustomer,
  DecryptedCustomer,
} from '../interfaces/customer-list.interface';

/**
 * Maps a raw MongoDB customer document to a decrypted customer DTO.
 *
 * Extracted into a pure function so it can be unit-tested independently
 * and reused across the service.
 */
export function decryptCustomer(
  raw: RawCustomer,
  encryptionService: EncryptionService,
): DecryptedCustomer {
  const balance = encryptionService.decrypt<number>(
    raw.balance ?? 'v1:aaaa:aaaa:MA==',
  );

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const overdue =
    balance > 0 &&
    (!raw.lastPaymentAt || new Date(raw.lastPaymentAt) < sevenDaysAgo);

  return {
    ...raw,
    balance,
    totalDebt: encryptionService.decrypt<number>(
      raw.totalDebt ?? 'v1:aaaa:aaaa:MA==',
    ),
    totalPaid: encryptionService.decrypt<number>(
      raw.totalPaid ?? 'v1:aaaa:aaaa:MA==',
    ),
    overdue,
  };
}

/**
 * Maps an array of raw customer documents to decrypted DTOs.
 */
export function decryptCustomers(
  raws: RawCustomer[],
  encryptionService: EncryptionService,
): DecryptedCustomer[] {
  return raws.map((raw) => decryptCustomer(raw, encryptionService));
}

/**
 * Computes the summary total debt from a list of decrypted customers.
 */
export function computeTotalDebt(customers: DecryptedCustomer[]): number {
  return customers
    .filter((c) => c.balance > 0)
    .reduce((sum, c) => sum + c.balance, 0);
}

/**
 * In-memory sort for encrypted fields (e.g. balance).
 *
 * This is a fallback strategy when MongoDB cannot sort the field natively.
 * For true production scale (100K+), add a denormalized unencrypted numeric
 * field to the schema and swap this for a pure MongoDB sort.
 */
export function sortByFieldInMemory<T>(
  items: T[],
  field: string,
  direction: 1 | -1,
): T[] {
  return items.sort((a, b) => {
    const aVal = ((a as Record<string, unknown>)[field] as number) ?? 0;
    const bVal = ((b as Record<string, unknown>)[field] as number) ?? 0;

    if (aVal === bVal) return 0;
    const cmp = aVal < bVal ? -1 : 1;
    return direction === 1 ? cmp : -cmp;
  });
}

/**
 * Paginates an already-sorted in-memory array.
 */
export function paginateInMemory<T>(
  items: T[],
  page: number,
  limit: number,
): T[] {
  const skip = (page - 1) * limit;
  return items.slice(skip, skip + limit);
}
