import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EncryptionService } from '../encryption/encryption.service';
import {
  DailySummary,
  DailySummaryDocument,
} from './schemas/daily-summary.schema';
import {
  CustomerSnapshot,
  CustomerSnapshotDocument,
} from './schemas/customer-snapshot.schema';

export interface UpdateSnapshotPayload {
  userId: Types.ObjectId;
  customerId: Types.ObjectId;
  balance: number;
  totalDebt: number;
  totalPaid: number;
  hasDebt: boolean;
  lastTransactionAt?: Date | null;
  lastPaymentAt?: Date | null;
  transactionCount?: number;
}

export interface DailyTransactionImpact {
  userId: Types.ObjectId;
  date: Date;
  amount: number;
  type: 'debt' | 'payment';
}

/**
 * Report projection service.
 *
 * Maintains encrypted read-models (DailySummary, CustomerSnapshot)
 * so that dashboards and reports can be served without MongoDB
 * aggregating encrypted fields.
 *
 * This is the read-model updater in our CQRS architecture.
 */
@Injectable()
export class ReportProjectionsService {
  private readonly logger = new Logger(ReportProjectionsService.name);

  constructor(
    @InjectModel(DailySummary.name)
    private readonly dailySummaryModel: Model<DailySummaryDocument>,
    @InjectModel(CustomerSnapshot.name)
    private readonly customerSnapshotModel: Model<CustomerSnapshotDocument>,
    private readonly encryptionService: EncryptionService,
  ) {}

  // ========================================================================
  // Customer Snapshot
  // ========================================================================

  async upsertCustomerSnapshot(
    payload: UpdateSnapshotPayload,
  ): Promise<void> {
    await this.customerSnapshotModel.updateOne(
      { customerId: payload.customerId },
      {
        $set: {
          userId: payload.userId,
          balance: this.encryptionService.encrypt(payload.balance),
          totalDebt: this.encryptionService.encrypt(payload.totalDebt),
          totalPaid: this.encryptionService.encrypt(payload.totalPaid),
          hasDebt: payload.hasDebt,
          lastTransactionAt: payload.lastTransactionAt ?? null,
          lastPaymentAt: payload.lastPaymentAt ?? null,
          ...(payload.transactionCount !== undefined && {
            transactionCount: payload.transactionCount,
          }),
        },
      },
      { upsert: true },
    );
  }

  async getCustomerSnapshot(
    customerId: Types.ObjectId,
  ): Promise<CustomerSnapshotDocument | null> {
    return this.customerSnapshotModel.findOne({ customerId }).lean();
  }

  async findSnapshotsByUser(
    userId: Types.ObjectId,
    filter?: { hasDebt?: boolean },
  ): Promise<CustomerSnapshotDocument[]> {
    const query: Record<string, any> = { userId };
    if (filter?.hasDebt !== undefined) {
      query.hasDebt = filter.hasDebt;
    }
    return this.customerSnapshotModel.find(query).lean();
  }

  // ========================================================================
  // Daily Summary
  // ========================================================================

  async recordDailyImpact(impact: DailyTransactionImpact): Promise<void> {
    const date = this.stripTime(impact.date);

    const existing = await this.dailySummaryModel.findOne({
      userId: impact.userId,
      date,
    });

    if (!existing) {
      const debtAdded = impact.type === 'debt' ? impact.amount : 0;
      const paymentReceived = impact.type === 'payment' ? impact.amount : 0;
      const netChange = debtAdded - paymentReceived;

      await this.dailySummaryModel.create({
        userId: impact.userId,
        date,
        totalDebtAdded: this.encryptionService.encrypt(debtAdded),
        totalPaymentReceived: this.encryptionService.encrypt(paymentReceived),
        netChange: this.encryptionService.encrypt(netChange),
        transactionCount: 1,
        debtTransactionCount: impact.type === 'debt' ? 1 : 0,
        paymentTransactionCount: impact.type === 'payment' ? 1 : 0,
      });
      return;
    }

    // Decrypt existing totals, update, re-encrypt
    const currentDebtAdded = this.encryptionService.decrypt<number>(
      existing.totalDebtAdded ?? 'v1:aaaa:aaaa:MQ==',
    );
    const currentPaymentReceived = this.encryptionService.decrypt<number>(
      existing.totalPaymentReceived ?? 'v1:aaaa:aaaa:MA==',
    );

    const newDebtAdded =
      currentDebtAdded + (impact.type === 'debt' ? impact.amount : 0);
    const newPaymentReceived =
      currentPaymentReceived +
      (impact.type === 'payment' ? impact.amount : 0);
    const newNetChange = newDebtAdded - newPaymentReceived;

    await this.dailySummaryModel.updateOne(
      { _id: existing._id },
      {
        $set: {
          totalDebtAdded: this.encryptionService.encrypt(newDebtAdded),
          totalPaymentReceived: this.encryptionService.encrypt(newPaymentReceived),
          netChange: this.encryptionService.encrypt(newNetChange),
        },
        $inc: {
          transactionCount: 1,
          debtTransactionCount: impact.type === 'debt' ? 1 : 0,
          paymentTransactionCount: impact.type === 'payment' ? 1 : 0,
        },
      },
    );
  }

  async getDailySummaries(
    userId: Types.ObjectId,
    from: Date,
    to: Date,
  ): Promise<DailySummaryDocument[]> {
    return this.dailySummaryModel
      .find({
        userId,
        date: { $gte: this.stripTime(from), $lte: this.stripTime(to) },
      })
      .sort({ date: -1 })
      .lean();
  }

  async getOrCreateDailySummary(
    userId: Types.ObjectId,
    date: Date,
  ): Promise<DailySummaryDocument> {
    const stripped = this.stripTime(date);
    let summary = await this.dailySummaryModel.findOne({
      userId,
      date: stripped,
    });

    if (!summary) {
      summary = await this.dailySummaryModel.create({
        userId,
        date: stripped,
        totalDebtAdded: this.encryptionService.encrypt(0),
        totalPaymentReceived: this.encryptionService.encrypt(0),
        netChange: this.encryptionService.encrypt(0),
        transactionCount: 0,
        debtTransactionCount: 0,
        paymentTransactionCount: 0,
      });
    }

    return summary;
  }

  // ========================================================================
  // Rebuild from events (disaster recovery)
  // ========================================================================

  async rebuildDailySummary(
    userId: Types.ObjectId,
    date: Date,
    transactions: Array<{ amount: number; type: 'debt' | 'payment' }>,
  ): Promise<void> {
    const stripped = this.stripTime(date);

    let debtAdded = 0;
    let paymentReceived = 0;

    for (const tx of transactions) {
      if (tx.type === 'debt') debtAdded += tx.amount;
      else paymentReceived += tx.amount;
    }

    await this.dailySummaryModel.updateOne(
      { userId, date: stripped },
      {
        $set: {
          totalDebtAdded: this.encryptionService.encrypt(debtAdded),
          totalPaymentReceived: this.encryptionService.encrypt(paymentReceived),
          netChange: this.encryptionService.encrypt(debtAdded - paymentReceived),
          transactionCount: transactions.length,
        },
      },
      { upsert: true },
    );
  }

  // ========================================================================
  // Helpers
  // ========================================================================

  private stripTime(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }
}
