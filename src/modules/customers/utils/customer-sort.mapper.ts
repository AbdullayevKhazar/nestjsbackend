import { BadRequestException } from '@nestjs/common';
import type { CustomerSortValue } from '../dto/get-customers-query.dto';

/**
 * Sort configuration mapping API sort values to MongoDB sort objects.
 *
 * Fields that are encrypted at rest (balance) are marked as `isEncrypted: true`
 * so the service can decide whether to sort in MongoDB or in memory.
 */
interface SortConfig {
  field: string;
  direction: 1 | -1;
  isEncrypted: boolean;
}

const SORT_MAP: Record<CustomerSortValue, SortConfig> = {
  balance_asc: { field: 'balance', direction: 1, isEncrypted: true },
  balance_desc: { field: 'balance', direction: -1, isEncrypted: true },
  created_asc: { field: 'createdAt', direction: 1, isEncrypted: false },
  created_desc: { field: 'createdAt', direction: -1, isEncrypted: false },
  name_asc: { field: 'fullName', direction: 1, isEncrypted: false },
  name_desc: { field: 'fullName', direction: -1, isEncrypted: false },
  lastTransaction_asc: {
    field: 'lastTransactionAt',
    direction: 1,
    isEncrypted: false,
  },
  lastTransaction_desc: {
    field: 'lastTransactionAt',
    direction: -1,
    isEncrypted: false,
  },
};

/**
 * Validates the sort value and returns its MongoDB sort configuration.
 */
export function getSortConfig(sort: CustomerSortValue): SortConfig {
  const config = SORT_MAP[sort];
  if (!config) {
    throw new BadRequestException(`Invalid sort value: ${sort}`);
  }
  return config;
}

/**
 * Returns true if the sort can be executed entirely inside MongoDB.
 * Encrypted fields require in-memory sorting because their ciphertext
 * does not preserve numeric order.
 */
export function isMongoSortable(sort: CustomerSortValue): boolean {
  return !getSortConfig(sort).isEncrypted;
}

/**
 * Returns the MongoDB sort object for a given sort value.
 */
export function toMongoSort(
  sort: CustomerSortValue,
): Record<string, 1 | -1> {
  const config = getSortConfig(sort);
  return { [config.field]: config.direction };
}

/**
 * Returns the field name and direction for a given sort value.
 * Useful for in-memory sorting strategies.
 */
export function getSortFieldAndDirection(
  sort: CustomerSortValue,
): { field: string; direction: 1 | -1 } {
  const config = getSortConfig(sort);
  return { field: config.field, direction: config.direction };
}
