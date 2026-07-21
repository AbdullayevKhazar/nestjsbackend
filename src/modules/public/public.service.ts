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
import { EncryptionService } from '../encryption/encryption.service';
import { isOverdueCustomer } from '../customers/utils/customer-response.mapper';

@Injectable()
export class PublicService {
  constructor(
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,

    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<TransactionDocument>,

    private readonly encryptionService: EncryptionService,
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

    // Decrypt amounts for response
    const decryptedTransactions = transactions.map((tx: any) => ({
      ...tx,
      amount: this.encryptionService.decrypt<number>(
        tx.amount ?? 'v1:aaaa:aaaa:MA==',
      ),
    }));

    const balance = this.encryptionService.decrypt<number>(
      customer.balance ?? 'v1:aaaa:aaaa:MA==',
    );

    return {
      customer: {
        id: customer._id,
        fullName: customer.fullName,
        phone: customer.phone,
        location: customer.location,
        note: customer.note,
        balance,
        isOverdue: isOverdueCustomer(customer),
      },
      transactions: decryptedTransactions,
    };
  }
}
