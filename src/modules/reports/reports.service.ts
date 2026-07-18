import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

import { Model, Types } from 'mongoose';

import {
  Customer,
  CustomerDocument,
} from '../customers/schemas/customer.schema';

import {
  Transaction,
  TransactionDocument,
} from '../transactions/schemas/transaction.schema';
import { ReportQueryDto, ReportPeriod } from './dto/report-query.dto';
import { EncryptionService } from '../encryption/encryption.service';
import { ReportProjectionsService } from './report-projections.service';

@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,

    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<TransactionDocument>,

    private readonly encryptionService: EncryptionService,
    private readonly projectionsService: ReportProjectionsService,
  ) {}

  async overview(userId: string) {
    const objectUserId = new Types.ObjectId(userId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const [customerCount, debtCustomerCount, todaySummaries, monthSummaries] =
      await Promise.all([
        this.customerModel.countDocuments({
          createdBy: objectUserId,
          isDeleted: false,
        }),

        this.customerModel.countDocuments({
          createdBy: objectUserId,
          isDeleted: false,
          hasDebt: true,
        }),

        this.projectionsService.getDailySummaries(
          objectUserId,
          today,
          tomorrow,
        ),

        this.projectionsService.getDailySummaries(
          objectUserId,
          monthStart,
          tomorrow,
        ),
      ]);

    // Decrypt and sum daily summaries
    let todayDebt = 0;
    let todayPayment = 0;
    for (const summary of todaySummaries) {
      todayDebt += this.encryptionService.decrypt<number>(
        summary.totalDebtAdded ?? 'v1:aaaa:aaaa:MA==',
      );
      todayPayment += this.encryptionService.decrypt<number>(
        summary.totalPaymentReceived ?? 'v1:aaaa:aaaa:MA==',
      );
    }

    let monthDebt = 0;
    let monthPayment = 0;
    for (const summary of monthSummaries) {
      monthDebt += this.encryptionService.decrypt<number>(
        summary.totalDebtAdded ?? 'v1:aaaa:aaaa:MA==',
      );
      monthPayment += this.encryptionService.decrypt<number>(
        summary.totalPaymentReceived ?? 'v1:aaaa:aaaa:MA==',
      );
    }

    // Current totals: decrypt from customer snapshots
    const customers = await this.customerModel
      .find({ createdBy: objectUserId, isDeleted: false })
      .select('balance totalDebt totalPaid')
      .lean();

    let totalDebt = 0;
    let totalBorrowed = 0;
    let totalPaid = 0;

    for (const c of customers) {
      totalDebt += this.encryptionService.decrypt<number>(
        c.balance ?? 'v1:aaaa:aaaa:MA==',
      );
      totalBorrowed += this.encryptionService.decrypt<number>(
        c.totalDebt ?? 'v1:aaaa:aaaa:MA==',
      );
      totalPaid += this.encryptionService.decrypt<number>(
        c.totalPaid ?? 'v1:aaaa:aaaa:MA==',
      );
    }

    return {
      totalDebt,
      totalBorrowed,
      totalPaid,

      customerCount,
      debtCustomerCount,

      todayDebt,
      todayPayment,

      monthDebt,
      monthPayment,
    };
  }

  async report(dto: ReportQueryDto, userId: string) {
    const objectUserId = new Types.ObjectId(userId);

    let from: Date;
    let to: Date;

    // Custom date range
    if (dto.from || dto.to) {
      if (!dto.from || !dto.to) {
        throw new BadRequestException(
          'Both "from" and "to" must be provided together.',
        );
      }

      from = new Date(dto.from);
      from.setHours(0, 0, 0, 0);

      to = new Date(dto.to);
      to.setHours(23, 59, 59, 999);
    } else {
      const now = new Date();

      switch (dto.period ?? ReportPeriod.TODAY) {
        case ReportPeriod.TODAY:
          from = new Date(now);
          from.setHours(0, 0, 0, 0);

          to = new Date(now);
          to.setHours(23, 59, 59, 999);
          break;

        case ReportPeriod.WEEK:
          from = new Date(now);
          from.setDate(now.getDate() - 6);
          from.setHours(0, 0, 0, 0);

          to = new Date(now);
          to.setHours(23, 59, 59, 999);
          break;

        case ReportPeriod.MONTH:
          from = new Date(now.getFullYear(), now.getMonth(), 1);

          to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          to.setHours(23, 59, 59, 999);
          break;

        case ReportPeriod.YEAR:
          from = new Date(now.getFullYear(), 0, 1);

          to = new Date(now.getFullYear(), 11, 31);
          to.setHours(23, 59, 59, 999);
          break;
      }
    }

    // Fetch transactions — amounts are encrypted, plugin decrypts on find
    const transactions = await this.transactionModel
      .find({
        createdBy: objectUserId,
        isDeleted: false,
        date: {
          $gte: from,
          $lte: to,
        },
      })
      .sort({ date: -1, createdAt: -1 })
      .lean();

    // Fetch all referenced customers in one query
    const customerIds = Array.from(
      new Set(transactions.map((tx) => tx.customerId.toString())),
    );

    const customers = await this.customerModel
      .find({
        _id: { $in: customerIds.map((id) => new Types.ObjectId(id)) },
      })
      .lean();

    const customerMap = new Map(
      customers.map((c: any) => [
        c._id.toString(),
        {
          _id: c._id,
          fullName: c.fullName,
          phone: c.phone,
          location: c.location,
          note: c.note,
          balance: this.encryptionService.decrypt<number>(
            c.balance ?? 'v1:aaaa:aaaa:MA==',
          ),
          totalDebt: this.encryptionService.decrypt<number>(
            c.totalDebt ?? 'v1:aaaa:aaaa:MA==',
          ),
          totalPaid: this.encryptionService.decrypt<number>(
            c.totalPaid ?? 'v1:aaaa:aaaa:MA==',
          ),
        },
      ]),
    );

    // Application-level aggregation
    const summary = {
      debt: 0,
      payment: 0,
      balance: 0,
    };

    const grouped = new Map<string, any>();

    for (const tx of transactions) {
      const amount = this.encryptionService.decrypt<number>(
        (tx as any).amount ?? 'v1:aaaa:aaaa:MA==',
      );

      if (tx.type === 'debt') {
        summary.debt += amount;
      } else {
        summary.payment += amount;
      }

      const customer = customerMap.get(tx.customerId.toString());
      const customerId = tx.customerId.toString();

      if (!grouped.has(customerId)) {
        grouped.set(customerId, {
          customerId,
          customer: customer || { _id: tx.customerId },
          transactions: [],
        });
      }

      grouped.get(customerId).transactions.push({
        _id: tx._id,
        type: tx.type,
        amount,
        note: tx.note,
        date: tx.date,
        createdAt: tx.createdAt,
        updatedAt: tx.updatedAt,
      });
    }

    summary.balance = summary.debt - summary.payment;

    return {
      from,
      to,
      summary: {
        ...summary,
        transactionCount: transactions.length,
        customerCount: grouped.size,
      },
      customers: Array.from(grouped.values()),
    };
  }
}
