import { EncryptionService } from '../../encryption/encryption.service';
import type {
  RawCustomer,
  DecryptedCustomer,
} from '../interfaces/customer-list.interface';

export function isOverdueCustomer(
  customer: Pick<RawCustomer, 'hasDebt' | 'lastPaymentAt'> | {
    hasDebt?: boolean;
    lastPaymentAt?: Date | string | null;
  },
): boolean {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  return (
    customer.hasDebt === true &&
    (!customer.lastPaymentAt || new Date(customer.lastPaymentAt) < sevenDaysAgo)
  );
}

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

  return {
    ...raw,
    balance,
    totalDebt: encryptionService.decrypt<number>(
      raw.totalDebt ?? 'v1:aaaa:aaaa:MA==',
    ),
    totalPaid: encryptionService.decrypt<number>(
      raw.totalPaid ?? 'v1:aaaa:aaaa:MA==',
    ),
    overdue: isOverdueCustomer(raw),
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
    const aVal = (a as Record<string, unknown>)[field];
    const bVal = (b as Record<string, unknown>)[field];

    if (aVal === bVal) return 0;
    if (aVal === undefined || aVal === null) return direction === 1 ? -1 : 1;
    if (bVal === undefined || bVal === null) return direction === 1 ? 1 : -1;

    const left = aVal instanceof Date ? aVal.getTime() : aVal;
    const right = bVal instanceof Date ? bVal.getTime() : bVal;
    const cmp =
      typeof left === 'string' && typeof right === 'string'
        ? left.localeCompare(right)
        : (left as number) < (right as number)
          ? -1
          : 1;
    return direction === 1 ? cmp : -cmp;
  });
}

export function filterCustomersByOverdue<T extends { overdue?: boolean }>(
  customers: T[],
  overdue?: boolean | string | null,
): T[] {
  if (overdue === undefined || overdue === null || overdue === '') return customers;

  const normalized =
    overdue === true ||
    overdue === 'true' ||
    overdue === '1' ||
    overdue === 'yes' ||
    overdue === 'on'
      ? true
      : overdue === false ||
          overdue === 'false' ||
          overdue === '0' ||
          overdue === 'no' ||
          overdue === 'off'
        ? false
        : null;

  if (normalized === null) return customers;
  return customers.filter((customer) => customer.overdue === normalized);
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
