import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Transaction, TransactionDocument } from './schemas/transaction.schema';

import { CreateTransactionDto } from './dto/create-transaction.dto';
import { CustomersService } from '../customers/customers.service';
import { TransactionQueryDto } from './dto/transaction-query.dto';
import { TransactionType } from './enum/transaction-type.enum';
import { UpdateTransactionDto } from './dto/update-transaction.dto';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<TransactionDocument>,

    private readonly customersService: CustomersService,
  ) {}

  async create(dto: CreateTransactionDto, userId: string) {
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

    if (dto.type === 'debt') {
      await this.customersService.increaseDebt(dto.customerId, dto.amount);
    } else {
      await this.customersService.increasePayment(dto.customerId, dto.amount);
    }

    return transaction;
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

    // Count unique customers with matching transactions
    const countResult = await this.transactionModel.aggregate([
      { $match: matchStage },
      { $group: { _id: '$customerId' } },
      { $count: 'total' },
    ]);

    const total = countResult[0]?.total ?? 0;

    // Aggregate transactions grouped by customer with pagination
    const grouped = await this.transactionModel.aggregate([
      { $match: matchStage },
      { $sort: { date: -1, createdAt: -1 } },
      {
        $group: {
          _id: '$customerId',
          transactions: {
            $push: {
              _id: '$_id',
              type: '$type',
              amount: '$amount',
              note: '$note',
              date: '$date',
              createdAt: '$createdAt',
              updatedAt: '$updatedAt',
            },
          },
          lastDate: { $first: '$date' },
          lastCreatedAt: { $first: '$createdAt' },
        },
      },
      { $sort: { lastDate: -1, lastCreatedAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: 'customers',
          localField: '_id',
          foreignField: '_id',
          as: 'customer',
        },
      },
      { $unwind: '$customer' },
      {
        $project: {
          _id: { $toString: '$_id' },
          fullName: '$customer.fullName',
          phone: '$customer.phone',
          balance: '$customer.balance',
          transactions: 1,
        },
      },
    ]);

    return {
      items: grouped,
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

    return transaction;
  }

  async update(id: string, dto: UpdateTransactionDto, userId: string) {
    const transaction = await this.transactionModel.findOne({
      _id: new Types.ObjectId(id),
      createdBy: new Types.ObjectId(userId),
      isDeleted: false,
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    // Rollback the old transaction's effect on balance
    if (transaction.type === TransactionType.DEBT) {
      await this.customersService.rollbackDebt(
        transaction.customerId.toString(),
        transaction.amount,
      );
    } else {
      await this.customersService.rollbackPayment(
        transaction.customerId.toString(),
        transaction.amount,
      );
    }

    // Apply new transaction's effect
    const newType = dto.type ?? transaction.type;
    const newAmount = dto.amount ?? transaction.amount;
    const newCustomerId = dto.customerId
      ? new Types.ObjectId(dto.customerId)
      : transaction.customerId;

    // If customer changed, verify the new customer exists
    if (dto.customerId && dto.customerId !== transaction.customerId.toString()) {
      const customer = await this.customersService.findOne(
        dto.customerId,
        userId,
      );
      if (!customer) {
        // Re-apply the old effect since we already rolled it back
        if (transaction.type === TransactionType.DEBT) {
          await this.customersService.increaseDebt(
            transaction.customerId.toString(),
            transaction.amount,
          );
        } else {
          await this.customersService.increasePayment(
            transaction.customerId.toString(),
            transaction.amount,
          );
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
    transaction.amount = newAmount;
    transaction.customerId = newCustomerId;

    if (dto.note !== undefined) {
      transaction.note = dto.note ?? null;
    }

    if (dto.date) {
      const newDate = new Date(dto.date);
      newDate.setHours(0, 0, 0, 0);
      transaction.date = newDate;
    }

    await transaction.save();

    return transaction;
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

    if (transaction.type === TransactionType.DEBT) {
      await this.customersService.rollbackDebt(
        transaction.customerId.toString(),
        transaction.amount,
      );
    } else {
      await this.customersService.rollbackPayment(
        transaction.customerId.toString(),
        transaction.amount,
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
