import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

import { Customer, CustomerDocument } from './schemas/customer.schema';

import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { GetCustomersQueryDto } from './dto/get-customers-query.dto';
import { Model, Types } from 'mongoose';
import {
  Transaction,
  TransactionDocument,
} from '../transactions/schemas/transaction.schema';
import { EncryptionService } from '../encryption/encryption.service';
import { ReportProjectionsService } from '../reports/report-projections.service';
import { FinancialEventsService } from '../events/financial-events.service';
import { FinancialEventType } from '../events/schemas/financial-event.schema';
import { CustomerFilterBuilder } from './utils/customer-filter.builder';
import {
  isMongoSortable,
  toMongoSort,
  getSortFieldAndDirection,
} from './utils/customer-sort.mapper';
import {
  decryptCustomers,
  computeTotalDebt,
  sortByFieldInMemory,
  paginateInMemory,
  filterCustomersByOverdue,
} from './utils/customer-response.mapper';
import type {
  PaginatedListResponse,
  DecryptedCustomer,
} from './interfaces/customer-list.interface';

@Injectable()
export class CustomersService {
  constructor(
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,

    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<TransactionDocument>,

    private readonly encryptionService: EncryptionService,
    private readonly projectionsService: ReportProjectionsService,
    private readonly eventsService: FinancialEventsService,
  ) {}

  async create(
    createCustomerDto: CreateCustomerDto,
    userId: string,
  ): Promise<Customer> {
    // eslint-disable-next-line no-console
    console.log(`[DEBUG-SERVICE] CustomersService.create() START`);
    const customer = await this.customerModel.create({
      ...createCustomerDto,
      createdBy: new Types.ObjectId(userId),
      balance: 0,
      totalDebt: 0,
      totalPaid: 0,
      hasDebt: false,
    });
    // eslint-disable-next-line no-console
    console.log(
      `[DEBUG-SERVICE] CustomersService.create() AFTER create(). ` +
        `customer.balance=${JSON.stringify((customer as any).balance)} ` +
        `customer.totalDebt=${JSON.stringify((customer as any).totalDebt)} ` +
        `customer.totalPaid=${JSON.stringify((customer as any).totalPaid)}`,
    );

    // Initialize snapshot
    await this.projectionsService.upsertCustomerSnapshot({
      userId: new Types.ObjectId(userId),
      customerId: customer._id as Types.ObjectId,
      balance: 0,
      totalDebt: 0,
      totalPaid: 0,
      hasDebt: false,
    });

    // eslint-disable-next-line no-console
    console.log(`[DEBUG-SERVICE] CustomersService.create() END`);
    return customer;
  }

  async findAll(
    query: GetCustomersQueryDto,
    userId: string,
  ): Promise<PaginatedListResponse<DecryptedCustomer>> {
    const { page, limit, search, location, sort, overdue } = query;

    // Build base filter dynamically using the chainable builder
    const baseFilter = new CustomerFilterBuilder()
      .withUser(userId)
      .withSearch(search)
      .withLocation(location)
      .build();

    const sortConfig = getSortFieldAndDirection(sort);

    if (overdue !== undefined && overdue !== null) {
      const rawCustomers = await this.customerModel.find(baseFilter).lean();
      const decrypted = decryptCustomers(
        rawCustomers as any,
        this.encryptionService,
      );
      const filtered = filterCustomersByOverdue(decrypted, overdue);
      const sorted = sortByFieldInMemory(
        filtered,
        sortConfig.field,
        sortConfig.direction,
      );
      const items = paginateInMemory(sorted, page, limit);
      const totalDebt = computeTotalDebt(items);

      return {
        summary: { totalDebt },
        items,
        meta: {
          page,
          limit,
          total: filtered.length,
          totalPages: Math.ceil(filtered.length / limit),
        },
      };
    }

    const filter = new CustomerFilterBuilder()
      .withUser(userId)
      .withSearch(search)
      .withLocation(location)
      .build();

    // Strategy 1: MongoDB-native sort (non-encrypted fields)
    if (isMongoSortable(sort)) {
      const skip = (page - 1) * limit;
      const mongoSort = toMongoSort(sort);

      const [rawCustomers, total] = await Promise.all([
        this.customerModel
          .find(filter)
          .sort(mongoSort)
          .skip(skip)
          .limit(limit)
          .lean(),
        this.customerModel.countDocuments(filter),
      ]);

      const items = decryptCustomers(
        rawCustomers as any,
        this.encryptionService,
      );
      const totalDebt = computeTotalDebt(items);

      return {
        summary: { totalDebt },
        items,
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    }

    // Strategy 2: In-memory sort (encrypted fields like balance)
    // TODO: For true production scale (100K+), add a denormalized unencrypted
    // numeric field (e.g. balanceNumeric) to the schema and swap this branch
    // for a pure MongoDB sort.
    const rawCustomers = await this.customerModel.find(filter).lean();
    const decrypted = decryptCustomers(
      rawCustomers as any,
      this.encryptionService,
    );

    const sorted = sortByFieldInMemory(
      decrypted,
      sortConfig.field,
      sortConfig.direction,
    );
    const items = paginateInMemory(sorted, page, limit);
    const totalDebt = computeTotalDebt(items);
    return {
      summary: { totalDebt },
      items,
      meta: {
        page,
        limit,
        total: sorted.length,
        totalPages: Math.ceil(sorted.length / limit),
      },
    };
  }

  async getLocations(userId: string) {
    const objectUserId = new Types.ObjectId(userId);

    return this.customerModel.aggregate([
      {
        $match: {
          createdBy: objectUserId,
          isDeleted: false,
          location: {
            $nin: [null, ''],
          },
        },
      },
      {
        $group: {
          _id: '$location',
          count: {
            $sum: 1,
          },
        },
      },
      {
        $project: {
          _id: 0,
          name: '$_id',
          count: 1,
        },
      },
      {
        $sort: {
          count: -1,
          name: 1,
        },
      },
    ]);
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

    // Decrypt transaction amounts
    const decryptedTransactions = transactions.map((tx: any) => ({
      ...tx,
      amount: this.encryptionService.decrypt<number>(
        tx.amount ?? 'v1:aaaa:aaaa:MA==',
      ),
    }));

    // Decrypt customer financial fields
    const decryptedCustomer = {
      ...customer,
      balance: this.encryptionService.decrypt<number>(
        customer.balance ?? 'v1:aaaa:aaaa:MA==',
      ),
      totalDebt: this.encryptionService.decrypt<number>(
        customer.totalDebt ?? 'v1:aaaa:aaaa:MA==',
      ),
      totalPaid: this.encryptionService.decrypt<number>(
        customer.totalPaid ?? 'v1:aaaa:aaaa:MA==',
      ),
      reminderEnabled: customer.reminderEnabled ?? true,
      lastReminderSentAt: customer.lastReminderSentAt ?? null,
    };

    return {
      customer: decryptedCustomer,
      transactions: decryptedTransactions,
    };
  }

  async update(
    id: string,
    dto: Partial<Customer>,
    userId: string,
  ): Promise<Customer> {
    // eslint-disable-next-line no-console
    console.log(
      `[DEBUG-SERVICE] CustomersService.update() START. dto keys=${Object.keys(dto).join(', ')}`,
    );
    const customer = await this.customerModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        createdBy: new Types.ObjectId(userId),
        isDeleted: false,
      },
      dto,
      {
        new: true,
        runValidators: true,
      },
    );
    // eslint-disable-next-line no-console
    console.log(`[DEBUG-SERVICE] CustomersService.update() END`);

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

  // ========================================================================
  // Financial mutations — read → decrypt → modify → save
  // ========================================================================

  async increaseDebt(
    customerId: string,
    amount: number,
    transactionId?: string,
  ): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(
      `[DEBUG-SERVICE] increaseDebt() START customerId=${customerId} amount=${amount}`,
    );
    const customer = await this.customerModel.findOne({
      _id: customerId,
      isDeleted: false,
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    // eslint-disable-next-line no-console
    console.log(
      `[DEBUG-SERVICE] increaseDebt() BEFORE modify. ` +
        `raw balance=${JSON.stringify(customer.balance)} ` +
        `raw totalDebt=${JSON.stringify(customer.totalDebt)} ` +
        `raw totalPaid=${JSON.stringify(customer.totalPaid)}`,
    );

    // Decrypt current values
    const currentBalance = this.encryptionService.decrypt<number>(
      customer.balance ?? 'v1:aaaa:aaaa:MA==',
    );
    const currentTotalDebt = this.encryptionService.decrypt<number>(
      customer.totalDebt ?? 'v1:aaaa:aaaa:MA==',
    );
    const currentTotalPaid = this.encryptionService.decrypt<number>(
      customer.totalPaid ?? 'v1:aaaa:aaaa:MA==',
    );

    const newBalance = currentBalance + amount;
    const newTotalDebt = currentTotalDebt + amount;
    const newHasDebt = newBalance > 0;

    // Save encrypted values (plugin will encrypt them)
    customer.balance = newBalance as any;
    customer.totalDebt = newTotalDebt as any;
    customer.totalPaid = currentTotalPaid as any;
    customer.hasDebt = newHasDebt;
    customer.lastTransactionAt = new Date();

    // eslint-disable-next-line no-console
    console.log(
      `[DEBUG-SERVICE] increaseDebt() BEFORE save(). ` +
        `assigned balance=${JSON.stringify(customer.balance)} ` +
        `assigned totalDebt=${JSON.stringify(customer.totalDebt)} ` +
        `assigned totalPaid=${JSON.stringify(customer.totalPaid)}`,
    );

    await customer.save();

    // eslint-disable-next-line no-console
    console.log(
      `[DEBUG-SERVICE] increaseDebt() AFTER save(). ` +
        `saved balance=${JSON.stringify((customer as any).balance)} ` +
        `saved totalDebt=${JSON.stringify((customer as any).totalDebt)} ` +
        `saved totalPaid=${JSON.stringify((customer as any).totalPaid)}`,
    );

    // Emit event for audit trail and projection rebuilds
    await this.eventsService.emitEvent({
      userId: customer.createdBy,
      customerId: customer._id as Types.ObjectId,
      eventType: FinancialEventType.DEBT_INCREASED,
      amount,
      balanceSnapshot: newBalance,
      totalDebtSnapshot: newTotalDebt,
      totalPaidSnapshot: currentTotalPaid,
      transactionId: transactionId ? new Types.ObjectId(transactionId) : null,
    });

    // Update read-model snapshot
    await this.projectionsService.upsertCustomerSnapshot({
      userId: customer.createdBy,
      customerId: customer._id as Types.ObjectId,
      balance: newBalance,
      totalDebt: newTotalDebt,
      totalPaid: currentTotalPaid,
      hasDebt: newHasDebt,
      lastTransactionAt: new Date(),
      lastPaymentAt: customer.lastPaymentAt,
    });

    // eslint-disable-next-line no-console
    console.log(`[DEBUG-SERVICE] increaseDebt() END`);
  }

  async increasePayment(
    customerId: string,
    amount: number,
    transactionId?: string,
  ): Promise<void> {
    const customer = await this.customerModel.findOne({
      _id: customerId,
      isDeleted: false,
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const currentBalance = this.encryptionService.decrypt<number>(
      customer.balance ?? 'v1:aaaa:aaaa:MA==',
    );
    const currentTotalDebt = this.encryptionService.decrypt<number>(
      customer.totalDebt ?? 'v1:aaaa:aaaa:MA==',
    );
    const currentTotalPaid = this.encryptionService.decrypt<number>(
      customer.totalPaid ?? 'v1:aaaa:aaaa:MA==',
    );

    const newBalance = currentBalance - amount;
    const newTotalPaid = currentTotalPaid + amount;
    const newHasDebt = newBalance > 0;

    customer.balance = newBalance as any;
    customer.totalPaid = newTotalPaid as any;
    customer.totalDebt = currentTotalDebt as any;
    customer.hasDebt = newHasDebt;
    customer.lastTransactionAt = new Date();
    customer.lastPaymentAt = new Date();

    await customer.save();

    await this.eventsService.emitEvent({
      userId: customer.createdBy,
      customerId: customer._id as Types.ObjectId,
      eventType: FinancialEventType.PAYMENT_INCREASED,
      amount,
      balanceSnapshot: newBalance,
      totalDebtSnapshot: currentTotalDebt,
      totalPaidSnapshot: newTotalPaid,
      transactionId: transactionId ? new Types.ObjectId(transactionId) : null,
    });

    await this.projectionsService.upsertCustomerSnapshot({
      userId: customer.createdBy,
      customerId: customer._id as Types.ObjectId,
      balance: newBalance,
      totalDebt: currentTotalDebt,
      totalPaid: newTotalPaid,
      hasDebt: newHasDebt,
      lastTransactionAt: new Date(),
      lastPaymentAt: new Date(),
    });
  }

  async rollbackDebt(customerId: string, amount: number): Promise<void> {
    const customer = await this.customerModel.findOne({
      _id: customerId,
      isDeleted: false,
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const currentTotalDebt = this.encryptionService.decrypt<number>(
      customer.totalDebt ?? 'v1:aaaa:aaaa:MA==',
    );

    if (currentTotalDebt < amount) {
      throw new BadRequestException(
        `Cannot rollback debt of ${amount}. Total debt is only ${currentTotalDebt}`,
      );
    }

    const currentBalance = this.encryptionService.decrypt<number>(
      customer.balance ?? 'v1:aaaa:aaaa:MA==',
    );
    const currentTotalPaid = this.encryptionService.decrypt<number>(
      customer.totalPaid ?? 'v1:aaaa:aaaa:MA==',
    );

    const newBalance = currentBalance - amount;
    const newTotalDebt = currentTotalDebt - amount;
    const newHasDebt = newBalance > 0;

    customer.balance = newBalance as any;
    customer.totalDebt = newTotalDebt as any;
    customer.totalPaid = currentTotalPaid as any;
    customer.hasDebt = newHasDebt;

    await customer.save();

    await this.eventsService.emitEvent({
      userId: customer.createdBy,
      customerId: customer._id as Types.ObjectId,
      eventType: FinancialEventType.DEBT_ROLLED_BACK,
      amount,
      balanceSnapshot: newBalance,
      totalDebtSnapshot: newTotalDebt,
      totalPaidSnapshot: currentTotalPaid,
    });

    await this.projectionsService.upsertCustomerSnapshot({
      userId: customer.createdBy,
      customerId: customer._id as Types.ObjectId,
      balance: newBalance,
      totalDebt: newTotalDebt,
      totalPaid: currentTotalPaid,
      hasDebt: newHasDebt,
      lastTransactionAt: customer.lastTransactionAt,
      lastPaymentAt: customer.lastPaymentAt,
    });
  }

  async rollbackPayment(customerId: string, amount: number): Promise<void> {
    const customer = await this.customerModel.findOne({
      _id: customerId,
      isDeleted: false,
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const currentTotalPaid = this.encryptionService.decrypt<number>(
      customer.totalPaid ?? 'v1:aaaa:aaaa:MA==',
    );

    if (currentTotalPaid < amount) {
      throw new BadRequestException(
        `Cannot rollback payment of ${amount}. Total paid is only ${currentTotalPaid}`,
      );
    }

    const currentBalance = this.encryptionService.decrypt<number>(
      customer.balance ?? 'v1:aaaa:aaaa:MA==',
    );
    const currentTotalDebt = this.encryptionService.decrypt<number>(
      customer.totalDebt ?? 'v1:aaaa:aaaa:MA==',
    );

    const newBalance = currentBalance + amount;
    const newTotalPaid = currentTotalPaid - amount;
    const newHasDebt = newBalance > 0;

    customer.balance = newBalance as any;
    customer.totalPaid = newTotalPaid as any;
    customer.totalDebt = currentTotalDebt as any;
    customer.hasDebt = newHasDebt;

    await customer.save();

    await this.eventsService.emitEvent({
      userId: customer.createdBy,
      customerId: customer._id as Types.ObjectId,
      eventType: FinancialEventType.PAYMENT_ROLLED_BACK,
      amount,
      balanceSnapshot: newBalance,
      totalDebtSnapshot: currentTotalDebt,
      totalPaidSnapshot: newTotalPaid,
    });

    await this.projectionsService.upsertCustomerSnapshot({
      userId: customer.createdBy,
      customerId: customer._id as Types.ObjectId,
      balance: newBalance,
      totalDebt: currentTotalDebt,
      totalPaid: newTotalPaid,
      hasDebt: newHasDebt,
      lastTransactionAt: customer.lastTransactionAt,
      lastPaymentAt: customer.lastPaymentAt,
    });
  }
}
