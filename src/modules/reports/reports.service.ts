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
import { DailyReportDto } from './dto/daily-report.dto';
import { MonthlyReportDto } from './dto/monthly-report.dto';
import { ReportPeriod, ReportQueryDto } from './dto/report-query.dto';

@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,

    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<TransactionDocument>,
  ) {}

  async overview(userId: string) {
    const objectUserId = new Types.ObjectId(userId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const [
      customerCount,
      debtCustomerCount,
      customerSummary,
      todaySummary,
      monthSummary,
    ] = await Promise.all([
      this.customerModel.countDocuments({
        createdBy: objectUserId,
        isDeleted: false,
      }),

      this.customerModel.countDocuments({
        createdBy: objectUserId,
        isDeleted: false,
        balance: { $gt: 0 },
      }),

      this.customerModel.aggregate([
        {
          $match: {
            createdBy: objectUserId,
            isDeleted: false,
          },
        },
        {
          $group: {
            _id: null,
            totalDebt: {
              $sum: '$totalDebt',
            },
            totalPaid: {
              $sum: '$totalPaid',
            },
            currentDebt: {
              $sum: '$balance',
            },
          },
        },
      ]),

      this.transactionModel.aggregate([
        {
          $match: {
            createdBy: objectUserId,
            isDeleted: false,
            date: {
              $gte: today,
              $lt: tomorrow,
            },
          },
        },
        {
          $group: {
            _id: '$type',
            amount: {
              $sum: '$amount',
            },
          },
        },
      ]),

      this.transactionModel.aggregate([
        {
          $match: {
            createdBy: objectUserId,
            isDeleted: false,
            date: {
              $gte: monthStart,
            },
          },
        },
        {
          $group: {
            _id: '$type',
            amount: {
              $sum: '$amount',
            },
          },
        },
      ]),
    ]);

    const summary = customerSummary[0] ?? {
      totalDebt: 0,
      totalPaid: 0,
      currentDebt: 0,
    };

    const todayDebt = todaySummary.find((x) => x._id === 'debt')?.amount ?? 0;

    const todayPayment =
      todaySummary.find((x) => x._id === 'payment')?.amount ?? 0;

    const monthDebt = monthSummary.find((x) => x._id === 'debt')?.amount ?? 0;

    const monthPayment =
      monthSummary.find((x) => x._id === 'payment')?.amount ?? 0;

    return {
      totalDebt: summary.currentDebt,
      totalBorrowed: summary.totalDebt,
      totalPaid: summary.totalPaid,

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

    const transactions = await this.transactionModel.aggregate([
      {
        $match: {
          createdBy: objectUserId,
          isDeleted: false,
          date: {
            $gte: from,
            $lte: to,
          },
        },
      },

      {
        $lookup: {
          from: 'customers',
          localField: 'customerId',
          foreignField: '_id',
          as: 'customer',
        },
      },

      {
        $unwind: '$customer',
      },

      {
        $sort: {
          date: -1,
          createdAt: -1,
        },
      },
    ]);

    const summary = {
      debt: 0,
      payment: 0,
      balance: 0,
    };

    for (const tx of transactions) {
      if (tx.type === 'debt') {
        summary.debt += tx.amount;
      } else {
        summary.payment += tx.amount;
      }
    }

    summary.balance = summary.debt - summary.payment;
    const grouped = new Map<string, any>();

    for (const tx of transactions) {
      const customer = tx.customer;
      const customerId = customer._id.toString();

      if (!grouped.has(customerId)) {
        grouped.set(customerId, {
          customerId,
          customer: {
            _id: customer._id,
            fullName: customer.fullName,
            phone: customer.phone,
            location: customer.location,
            note: customer.note,
            balance: customer.balance,
            totalDebt: customer.totalDebt,
            totalPaid: customer.totalPaid,
          },
          transactions: [],
        });
      }

      grouped.get(customerId).transactions.push({
        _id: tx._id,
        type: tx.type,
        amount: tx.amount,
        note: tx.note,
        date: tx.date,
        createdAt: tx.createdAt,
        updatedAt: tx.updatedAt,
      });
    }
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
