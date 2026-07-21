import { Types } from 'mongoose';

/**
 * Builds a MongoDB filter object for customer queries.
 *
 * Uses an additive, chainable builder pattern so that each filter criterion
 * is isolated in its own method.  New filters (e.g. minBalance, dateRange)
 * can be added as new methods without touching existing code.
 *
 * The final filter is wrapped in a single `$and` when multiple conditions
 * are present, ensuring that `$or` conditions from search and overdue do not
 * collide.
 */
export class CustomerFilterBuilder {
  private conditions: Record<string, unknown>[] = [];

  private normalizeBoolean(value?: boolean | string | null): boolean | null {
    if (value === undefined || value === null || value === '') return null;
    if (value === true || value === false) return value;
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
    return null;
  }

  /**
   * Mandatory base filter: scoped to a user and non-deleted records.
   */
  withUser(userId: string): this {
    this.conditions.push({
      createdBy: new Types.ObjectId(userId),
      isDeleted: false,
    });
    return this;
  }

  /**
   * Case-insensitive substring search across fullName, phone, and location.
   */
  withSearch(search?: string): this {
    const trimmed = search?.trim();
    if (!trimmed) return this;

    this.conditions.push({
      $or: [
        { fullName: { $regex: trimmed, $options: 'i' } },
        { phone: { $regex: trimmed, $options: 'i' } },
        { location: { $regex: trimmed, $options: 'i' } },
      ],
    });
    return this;
  }

  /**
   * Exact match on location (trimmed).  Empty / missing values are ignored.
   */
  withLocation(location?: string): this {
    const trimmed = location?.trim();
    if (!trimmed) return this;

    this.conditions.push({ location: trimmed });
    return this;
  }

  /**
   * Overdue filter based on the non-encrypted `hasDebt` flag and
   * `lastPaymentAt` timestamp.
   *
   * Overdue = hasDebt === true AND (lastPaymentAt is null OR > 7 days ago).
   *
   * This is an exact proxy because `hasDebt` is kept in sync with
   * balance > 0 by the business layer.
   */
  withOverdue(overdue?: boolean | string | null): this {
    const normalizedOverdue = this.normalizeBoolean(overdue);
    if (normalizedOverdue === null) return this;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    if (normalizedOverdue === true) {
      this.conditions.push({
        hasDebt: true,
        $or: [
          { lastPaymentAt: null },
          { lastPaymentAt: { $lt: sevenDaysAgo } },
        ],
      });
    } else {
      // Not overdue = either no debt, OR has debt but paid within last 7 days
      this.conditions.push({
        $or: [
          { hasDebt: false },
          { hasDebt: true, lastPaymentAt: { $gte: sevenDaysAgo } },
        ],
      });
    }

    return this;
  }

  /**
   * Assembles the final filter object.
   *
   * Returns `{}` when no conditions are set,
   * a single object when only one condition exists,
   * or `{ $and: [...] }` when multiple conditions are present.
   */
  build(): Record<string, unknown> {
    if (this.conditions.length === 0) return {};
    if (this.conditions.length === 1) return this.conditions[0];
    return { $and: this.conditions };
  }

  /**
   * Returns a clone of the internal conditions array (useful for testing / debugging).
   */
  getConditions(): Record<string, unknown>[] {
    return [...this.conditions];
  }
}
