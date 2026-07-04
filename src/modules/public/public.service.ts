import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

import { Model } from 'mongoose';

import {
  Customer,
  CustomerDocument,
} from '../customers/schemas/customer.schema';

import {
  Transaction,
  TransactionDocument,
} from '../transactions/schemas/transaction.schema';

@Injectable()
export class PublicService {
  constructor(
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,

    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<TransactionDocument>,
  ) {}

  async findCustomer(token: string) {
    const customer = await this.customerModel
      .findOne({
        publicToken: token,
        isDeleted: false,
        isPublic: true,
      })
      .lean();

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const transactions = await this.transactionModel
      .find({
        customerId: customer._id,
        isDeleted: false,
      })
      .sort({
        date: -1,
        createdAt: -1,
      })
      .lean();

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const isOverdue =
      customer.balance > 0 &&
      (!customer.lastTransactionAt ||
        customer.lastTransactionAt < sevenDaysAgo);

    return {
      customer: {
        id: customer._id,
        fullName: customer.fullName,
        phone: customer.phone,
        location: customer.location,
        note: customer.note,
        balance: customer.balance,
        isOverdue,
      },
      transactions,
    };
  }
}
