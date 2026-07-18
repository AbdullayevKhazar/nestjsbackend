/**
 * Response shape for paginated customer listings.
 *
 * Kept intentionally generic so it can be reused for other list endpoints
 * without modification.
 */
export interface PaginatedListResponse<T> {
  summary: Record<string, unknown>;
  items: T[];
  meta: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Raw customer document as returned by MongoDB (before decryption).
 */
export interface RawCustomer {
  _id: unknown;
  fullName: string;
  phone: string;
  location?: string | null;
  note?: string | null;
  createdBy: unknown;
  isDeleted: boolean;
  balance: string | number;
  totalDebt: string | number;
  totalPaid: string | number;
  hasDebt: boolean;
  lastTransactionAt?: Date | null;
  lastPaymentAt?: Date | null;
  lastReminderSentAt?: Date | null;
  reminderEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Customer after financial fields have been decrypted and computed fields added.
 */
export interface DecryptedCustomer extends Omit<RawCustomer, 'balance' | 'totalDebt' | 'totalPaid'> {
  balance: number;
  totalDebt: number;
  totalPaid: number;
  overdue: boolean;
}
