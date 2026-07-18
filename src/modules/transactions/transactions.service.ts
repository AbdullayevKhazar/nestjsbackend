import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Transaction, TransactionDocument } from './schemas/transaction.schema';

import { CreateTransactionDto } from './dto/create-transaction.dto';
import { CustomersService } from '../customers/customers.service';
import { TransactionQueryDto } from './dto/transaction-query.dto';
import { TransactionType } from './enum/transaction-type.enum';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { EncryptionService } from '../encryption/encryption.service';
import { ReportProjectionsService } from '../reports/report-projections.service';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<TransactionDocument>,

    private readonly customersService: CustomersService,
    private readonly encryptionService: EncryptionService,
    private readonly projectionsService: ReportProjectionsService,
  ) {}

  async create(dto: CreateTransactionDto, userId: string) {
    // eslint-disable-next-line no-console
    console.log(
      `[DEBUG-SERVICE] TransactionsService.create() START. amount=${dto.amount} type=${dto.type}`,
    );
    const customer = await this.customersService.findOne(
      dto.customerId,
      userId,
    );

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const transactionDate = dto.date ? new Date(dto.date) : new Date();
    transactionDate.setHours(0, 0, 0, 0);

    const transaction = await this.transactionModel.create({
      customerId: new Types.ObjectId(dto.customerId),
      type: dto.type,
      amount: dto.amount,
      note: dto.note ?? null,
      date: transactionDate,
      createdBy: new Types.ObjectId(userId),
    });

    // eslint-disable-next-line no-console
    console.log(
      `[DEBUG-SERVICE] TransactionsService.create() AFTER create(). ` +
        `raw amount=${JSON.stringify((transaction as any).amount)}`,
    );

    if (dto.type === 'debt') {
      await this.customersService.increaseDebt(
        dto.customerId,
        dto.amount,
        transaction._id.toString(),
      );
    } else {
      await this.customersService.increasePayment(
        dto.customerId,
        dto.amount,
        transaction._id.toString(),
      );
    }

    // Update daily summary projection
    await this.projectionsService.recordDailyImpact({
      userId: new Types.ObjectId(userId),
      date: transactionDate,
      amount: dto.amount,
      type: dto.type as 'debt' | 'payment',
    });

    // Decrypt amount for the response
    const decryptedTransaction = transaction.toObject();
    decryptedTransaction.amount = this.encryptionService.decrypt<number>(
      decryptedTransaction.amount,
    );

    // eslint-disable-next-line no-console
    console.log(`[DEBUG-SERVICE] TransactionsService.create() END`);
    return decryptedTransaction;
  }

  async findAll(query: TransactionQueryDto, userId: string) {
    const { page = 1, limit = 10, customerId, type } = query;

    const skip = (page - 1) * limit;

    const matchStage: Record<string, any> = {
      createdBy: new Types.ObjectId(userId),
      isDeleted: false,
    };

    if (customerId) {
      matchStage.customerId = new Types.ObjectId(customerId);
    }

    if (type) {
      matchStage.type = type;
    }

    // Fetch raw transactions — amounts are encrypted in DB, decrypted by plugin
    const transactions = await this.transactionModel
      .find(matchStage)
      .sort({ date: -1, createdAt: -1 })
      .lean();

    // Decrypt amounts explicitly (plugin handles init/find hooks, but lean()
    // with explicit transforms needs care)
    const decryptedTransactions = transactions.map((tx: any) => ({
      ...tx,
      amount: this.encryptionService.decrypt<number>(
        tx.amount ?? 'v1:aaaa:aaaa:MA==',
      ),
    }));

    // Application-level grouping by customer
    const customerMap = new Map<string, any>();
    const customerIds = Array.from(
      new Set(decryptedTransactions.map((tx) => tx.customerId.toString())),
    );

    // Fetch customer names in one query
    const customers = await this.customersService['customerModel']
      .find({
        _id: { $in: customerIds.map((id) => new Types.ObjectId(id)) },
        isDeleted: false,
      })
      .select('fullName phone balance hasDebt')
      .lean();

    const customerInfoMap = new Map(
      customers.map((c: any) => [
        c._id.toString(),
        {
          fullName: c.fullName,
          phone: c.phone,
          balance: this.encryptionService.decrypt<number>(
            c.balance ?? 'v1:aaaa:aaaa:MA==',
          ),
          hasDebt: c.hasDebt,
        },
      ]),
    );

    for (const tx of decryptedTransactions) {
      const cid = tx.customerId.toString();
      if (!customerMap.has(cid)) {
        customerMap.set(cid, {
          _id: cid,
          ...customerInfoMap.get(cid),
          transactions: [],
        });
      }
      customerMap.get(cid).transactions.push({
        _id: tx._id,
        type: tx.type,
        amount: tx.amount,
        note: tx.note,
        date: tx.date,
        createdAt: tx.createdAt,
        updatedAt: tx.updatedAt,
      });
    }

    // Apply pagination at the customer-group level
    const grouped = Array.from(customerMap.values());
    const total = grouped.length;
    const paginated = grouped.slice(skip, skip + limit);

    return {
      items: paginated,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, userId: string) {
    const transaction = await this.transactionModel
      .findOne({
        _id: new Types.ObjectId(id),
        createdBy: new Types.ObjectId(userId),
        isDeleted: false,
      })
      .populate('customerId', 'fullName phone balance')
      .lean();

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    // Decrypt amount
    const decrypted = {
      ...transaction,
      amount: this.encryptionService.decrypt<number>(
        (transaction as any).amount ?? 'v1:aaaa:aaaa:MA==',
      ),
    };

    // Decrypt populated customer balance
    if ((decrypted as any).customerId) {
      const customer = (decrypted as any).customerId;
      if (typeof customer === 'object' && customer.balance !== undefined) {
        customer.balance = this.encryptionService.decrypt<number>(
          customer.balance ?? 'v1:aaaa:aaaa:MA==',
        );
      }
    }

    return decrypted;
  }

  async update(id: string, dto: UpdateTransactionDto, userId: string) {
    // eslint-disable-next-line no-console
    console.log(`[DEBUG-SERVICE] TransactionsService.update() START id=${id}`);
    const transaction = await this.transactionModel.findOne({
      _id: new Types.ObjectId(id),
      createdBy: new Types.ObjectId(userId),
      isDeleted: false,
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    const oldAmount = this.encryptionService.decrypt<number>(
      transaction.amount,
    );
    const oldType = transaction.type;
    const oldCustomerId = transaction.customerId.toString();

    // Rollback the old transaction's effect on balance
    if (oldType === TransactionType.DEBT) {
      await this.customersService.rollbackDebt(oldCustomerId, oldAmount);
    } else {
      await this.customersService.rollbackPayment(oldCustomerId, oldAmount);
    }

    // Apply new transaction's effect
    const newType = dto.type ?? oldType;
    const newAmount = dto.amount ?? oldAmount;
    const newCustomerId = dto.customerId
      ? new Types.ObjectId(dto.customerId)
      : transaction.customerId;

    // If customer changed, verify the new customer exists
    if (
      dto.customerId &&
      dto.customerId !== transaction.customerId.toString()
    ) {
      const customer = await this.customersService.findOne(
        dto.customerId,
        userId,
      );
      if (!customer) {
        // Re-apply the old effect since we already rolled it back
        if (oldType === TransactionType.DEBT) {
          await this.customersService.increaseDebt(oldCustomerId, oldAmount);
        } else {
          await this.customersService.increasePayment(oldCustomerId, oldAmount);
        }
        throw new NotFoundException('Customer not found');
      }
    }

    // Apply new effect
    if (newType === TransactionType.DEBT) {
      await this.customersService.increaseDebt(
        newCustomerId.toString(),
        newAmount,
      );
    } else {
      await this.customersService.increasePayment(
        newCustomerId.toString(),
        newAmount,
      );
    }

    // Update transaction fields
    transaction.type = newType;
    transaction.amount = newAmount as any; // plugin encrypts on save
    transaction.customerId = newCustomerId;

    // eslint-disable-next-line no-console
    console.log(
      `[DEBUG-SERVICE] TransactionsService.update() BEFORE save(). ` +
        `assigned amount=${JSON.stringify(transaction.amount)}`,
    );

    if (dto.note !== undefined) {
      transaction.note = dto.note ?? null;
    }

    if (dto.date) {
      const newDate = new Date(dto.date);
      newDate.setHours(0, 0, 0, 0);
      transaction.date = newDate;
    }

    await transaction.save();

    // eslint-disable-next-line no-console
    console.log(
      `[DEBUG-SERVICE] TransactionsService.update() AFTER save(). ` +
        `saved amount=${JSON.stringify((transaction as any).amount)}`,
    );

    // Decrypt for response
    const decrypted = transaction.toObject();
    decrypted.amount = this.encryptionService.decrypt<number>(decrypted.amount);

    // eslint-disable-next-line no-console
    console.log(`[DEBUG-SERVICE] TransactionsService.update() END`);
    return decrypted;
  }

  async remove(id: string, userId: string): Promise<void> {
    const transaction = await this.transactionModel.findOne({
      _id: new Types.ObjectId(id),
      createdBy: new Types.ObjectId(userId),
      isDeleted: false,
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    const amount = this.encryptionService.decrypt<number>(transaction.amount);

    if (transaction.type === TransactionType.DEBT) {
      await this.customersService.rollbackDebt(
        transaction.customerId.toString(),
        amount,
      );
    } else {
      await this.customersService.rollbackPayment(
        transaction.customerId.toString(),
        amount,
      );
    }

    await this.transactionModel.updateOne(
      { _id: transaction._id },
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
        },
      },
    );
  }
}
