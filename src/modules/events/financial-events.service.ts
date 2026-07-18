import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EncryptionService } from '../encryption/encryption.service';
import {
  FinancialEvent,
  FinancialEventDocument,
  FinancialEventType,
} from './schemas/financial-event.schema';

export interface EmitEventPayload {
  userId: Types.ObjectId;
  customerId: Types.ObjectId;
  eventType: FinancialEventType;
  amount: number;
  balanceSnapshot?: number;
  totalDebtSnapshot?: number;
  totalPaidSnapshot?: number;
  transactionId?: Types.ObjectId | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Financial event store service.
 *
 * Implements an append-only event log for all financial mutations.
 * This provides:
 * - Complete audit trail
 * - Ability to rebuild any report or snapshot from scratch
 * - Compliance with financial data retention requirements
 */
@Injectable()
export class FinancialEventsService {
  private readonly logger = new Logger(FinancialEventsService.name);

  constructor(
    @InjectModel(FinancialEvent.name)
    private readonly eventModel: Model<FinancialEventDocument>,
    private readonly encryptionService: EncryptionService,
  ) {}

  async emitEvent(payload: EmitEventPayload): Promise<FinancialEventDocument> {
    const encryptedAmount = this.encryptionService.encrypt(payload.amount);
    const encryptedBalance = payload.balanceSnapshot !== undefined
      ? this.encryptionService.encrypt(payload.balanceSnapshot)
      : null;
    const encryptedTotalDebt = payload.totalDebtSnapshot !== undefined
      ? this.encryptionService.encrypt(payload.totalDebtSnapshot)
      : null;
    const encryptedTotalPaid = payload.totalPaidSnapshot !== undefined
      ? this.encryptionService.encrypt(payload.totalPaidSnapshot)
      : null;

    const event = await this.eventModel.create({
      userId: payload.userId,
      customerId: payload.customerId,
      eventType: payload.eventType,
      amount: encryptedAmount,
      balanceSnapshot: encryptedBalance,
      totalDebtSnapshot: encryptedTotalDebt,
      totalPaidSnapshot: encryptedTotalPaid,
      transactionId: payload.transactionId ?? null,
      metadata: payload.metadata ?? null,
    });

    this.logger.debug(
      `Emitted event ${payload.eventType} for customer ${payload.customerId}`,
    );

    return event;
  }

  async findEventsByCustomer(
    customerId: Types.ObjectId,
    options?: { limit?: number; sort?: 'asc' | 'desc' },
  ): Promise<FinancialEventDocument[]> {
    const query = this.eventModel
      .find({ customerId })
      .sort({ createdAt: options?.sort === 'asc' ? 1 : -1 });

    if (options?.limit) {
      query.limit(options.limit);
    }

    return query.lean();
  }

  async findEventsByUser(
    userId: Types.ObjectId,
    from?: Date,
    to?: Date,
  ): Promise<FinancialEventDocument[]> {
    const filter: Record<string, any> = { userId };

    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = from;
      if (to) filter.createdAt.$lte = to;
    }

    return this.eventModel.find(filter).sort({ createdAt: -1 }).lean();
  }

  /**
   * Rebuild customer state from events.
   * Useful for data recovery, validation, or migration.
   */
  async rebuildCustomerState(customerId: Types.ObjectId): Promise<{
    balance: number;
    totalDebt: number;
    totalPaid: number;
  }> {
    const events = await this.findEventsByCustomer(customerId, {
      sort: 'asc',
    });

    let balance = 0;
    let totalDebt = 0;
    let totalPaid = 0;

    for (const event of events) {
      const amount = this.encryptionService.decrypt<number>(event.amount);

      switch (event.eventType) {
        case FinancialEventType.DEBT_INCREASED:
          balance += amount;
          totalDebt += amount;
          break;
        case FinancialEventType.PAYMENT_INCREASED:
          balance -= amount;
          totalPaid += amount;
          break;
        case FinancialEventType.DEBT_ROLLED_BACK:
          balance -= amount;
          totalDebt -= amount;
          break;
        case FinancialEventType.PAYMENT_ROLLED_BACK:
          balance += amount;
          totalPaid -= amount;
          break;
        case FinancialEventType.TRANSACTION_DELETED:
          // Replay logic depends on the original transaction type stored in metadata
          if (event.metadata?.['originalType'] === 'debt') {
            balance -= amount;
            totalDebt -= amount;
          } else {
            balance += amount;
            totalPaid -= amount;
          }
          break;
      }
    }

    return { balance, totalDebt, totalPaid };
  }
}
