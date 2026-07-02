import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

import { Customer, CustomerDocument } from './schemas/customer.schema';

import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { Model, Types } from 'mongoose';
import {
  Transaction,
  TransactionDocument,
} from '../transactions/schemas/transaction.schema';

@Injectable()
export class CustomersService {
  constructor(
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,

    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<TransactionDocument>,
  ) {}

  async create(
    createCustomerDto: CreateCustomerDto,
    userId: string,
  ): Promise<Customer> {
    const customer = await this.customerModel.create({
      ...createCustomerDto,
      createdBy: new Types.ObjectId(userId),
    });

    return customer;
  }

  async findAll(query: CustomerQueryDto, userId: string) {
    const {
      page = 1,
      limit = 10,
      search,
      sortBy = 'createdAt',
      order = 'desc',
      hasDebt,
    } = query;

    const filter: Record<string, any> = {
      createdBy: new Types.ObjectId(userId),
      isDeleted: false,
    };

    if (hasDebt === true) {
      filter.balance = { $gt: 0 };
    }

    if (search?.trim()) {
      filter.$or = [
        {
          fullName: {
            $regex: search.trim(),
            $options: 'i',
          },
        },
        {
          phone: {
            $regex: search.trim(),
            $options: 'i',
          },
        },
      ];
    }

    const skip = (page - 1) * limit;

    const [customers, total, summary] = await Promise.all([
      this.customerModel
        .find(filter)
        .sort({
          [sortBy]: order === 'asc' ? 1 : -1,
        })
        .skip(skip)
        .limit(limit)
        .lean(),

      this.customerModel.countDocuments(filter),

      this.customerModel.aggregate([
        {
          $match: {
            createdBy: new Types.ObjectId(userId),
            isDeleted: false,
            balance: { $gt: 0 },
          },
        },
        {
          $group: {
            _id: null,
            totalDebt: {
              $sum: '$balance',
            },
          },
        },
      ]),
    ]);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const items = customers.map((customer: any) => ({
      ...customer,
      overdue:
        customer.balance > 0 &&
        (!customer.lastPaymentAt ||
          new Date(customer.lastPaymentAt) < sevenDaysAgo),
    }));

    return {
      summary: {
        totalDebt: summary[0]?.totalDebt ?? 0,
      },
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
  async findOne(id: string, userId: string) {
    const customer = await this.customerModel
      .findOne({
        _id: id,
        createdBy: new Types.ObjectId(userId),
        isDeleted: false,
      })
      .lean();

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const transactions = await this.transactionModel
      .find({
        customerId: new Types.ObjectId(id),
        createdBy: new Types.ObjectId(userId),
        isDeleted: false,
      })
      .sort({
        date: -1,
        createdAt: -1,
      })
      .lean();

    return {
      customer,
      transactions,
    };
  }
  async update(
    id: string,
    updateCustomerDto: UpdateCustomerDto,
    userId: string,
  ): Promise<Customer> {
    const customer = await this.customerModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        createdBy: new Types.ObjectId(userId),
        isDeleted: false,
      },
      updateCustomerDto,
      {
        new: true,
        runValidators: true,
      },
    );

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return customer;
  }

  async remove(id: string, userId: string): Promise<void> {
    const customer = await this.customerModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        createdBy: new Types.ObjectId(userId),
        isDeleted: false,
      },
      {
        isDeleted: true,
        deletedAt: new Date(),
      },
    );

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
  }

  async increaseDebt(customerId: string, amount: number): Promise<void> {
    const result = await this.customerModel.updateOne(
      {
        _id: customerId,
        isDeleted: false,
      },
      {
        $inc: {
          balance: amount,
          totalDebt: amount,
        },
        $set: {
          lastTransactionAt: new Date(),
        },
      },
    );

    if (!result.matchedCount) {
      throw new NotFoundException('Customer not found');
    }
  }

  async increasePayment(customerId: string, amount: number): Promise<void> {
    const customer = await this.customerModel.findOne({
      _id: customerId,
      isDeleted: false,
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const result = await this.customerModel.updateOne(
      {
        _id: customerId,
        isDeleted: false,
      },
      {
        $inc: {
          balance: -amount,
          totalPaid: amount,
        },
        $set: {
          lastTransactionAt: new Date(),
          lastPaymentAt: new Date(),
        },
      },
    );

    if (!result.matchedCount) {
      throw new NotFoundException('Customer not found');
    }
  }

  async rollbackDebt(customerId: string, amount: number): Promise<void> {
    const customer = await this.customerModel.findOne({
      _id: customerId,
      isDeleted: false,
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    if (customer.totalDebt < amount) {
      throw new BadRequestException(
        `Cannot rollback debt of ${amount}. Total debt is only ${customer.totalDebt}`,
      );
    }

    const result = await this.customerModel.updateOne(
      {
        _id: customerId,
        isDeleted: false,
      },
      {
        $inc: {
          balance: -amount,
          totalDebt: -amount,
        },
      },
    );

    if (!result.matchedCount) {
      throw new NotFoundException('Customer not found');
    }
  }

  async rollbackPayment(customerId: string, amount: number): Promise<void> {
    const customer = await this.customerModel.findOne({
      _id: customerId,
      isDeleted: false,
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    if (customer.totalPaid < amount) {
      throw new BadRequestException(
        `Cannot rollback payment of ${amount}. Total paid is only ${customer.totalPaid}`,
      );
    }

    const result = await this.customerModel.updateOne(
      {
        _id: customerId,
        isDeleted: false,
      },
      {
        $inc: {
          balance: amount,
          totalPaid: -amount,
        },
      },
    );

    if (!result.matchedCount) {
      throw new NotFoundException('Customer not found');
    }
  }
}
