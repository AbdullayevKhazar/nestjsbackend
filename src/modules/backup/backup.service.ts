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

// ---------------------------------------------------------------------------
// Constants (no magic strings)
// ---------------------------------------------------------------------------
const BACKUP_VERSION = 3;
const TRANSACTION_TYPE_DEBT = 'debt';
const KEY_DELIMITER = '::';

// ---------------------------------------------------------------------------
// Backup DTOs (input / output JSON contract — must stay identical)
// ---------------------------------------------------------------------------
interface DebtorDto {
  id: number;
  name: string;
  phone: string;
  location: string;
  note: string;
  created_at: number;
}

interface TransactionDto {
  id: number;
  debtor_id: number;
  type: string;
  amount: number;
  note: string;
  date: number;
  created_at: number;
}

interface BackupPayload {
  timestamp?: string;
  version?: number;
  debtors: DebtorDto[];
  transactions: TransactionDto[];
}

// ---------------------------------------------------------------------------
// Internal payload types
// ---------------------------------------------------------------------------
interface CustomerDocumentPayload {
  fullName: string;
  phone: string;
  location: string | null;
  note: string | null;
  createdBy: Types.ObjectId;
  balance: number;
  totalDebt: number;
  totalPaid: number;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface TransactionDocumentPayload {
  customerId: Types.ObjectId;
  type: string;
  amount: number;
  note: string | null;
  date: Date;
  createdBy: Types.ObjectId;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface CustomerStat {
  totalDebt: number;
  totalPaid: number;
  lastTransactionAt: Date | null;
  lastPaymentAt: Date | null;
}

interface LeanCustomer {
  _id: Types.ObjectId;
  fullName: string;
  phone: string;
  location?: string | null;
  note?: string | null;
  createdAt: Date;
}

interface LeanTransaction {
  _id: Types.ObjectId;
  customerId: Types.ObjectId;
  type: string;
  amount: number;
  note?: string | null;
  date: Date;
  createdAt: Date;
}

@Injectable()
export class BackupService {
  constructor(
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,

    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<TransactionDocument>,
  ) {}

  // =========================================================================
  //  EXPORT
  // =========================================================================

  async exportBackup(userId: string) {
    const objectUserId = new Types.ObjectId(userId);

    const customers = (await this.customerModel
      .find({ createdBy: objectUserId, isDeleted: false })
      .sort({ createdAt: 1 })
      .lean()) as LeanCustomer[];

    const customerIdToIndex = new Map<string, number>();

    const debtors = customers.map((customer, index) => {
      const sequentialId = index + 1;
      customerIdToIndex.set(customer._id.toString(), sequentialId);

      return {
        id: sequentialId,
        name: customer.fullName,
        phone: customer.phone,
        location: customer.location ?? '',
        note: customer.note ?? '',
        created_at: customer.createdAt.getTime(),
      };
    });

    const transactionsDb = (await this.transactionModel
      .find({ createdBy: objectUserId, isDeleted: false })
      .sort({ date: 1, createdAt: 1 })
      .lean()) as LeanTransaction[];

    const transactions = transactionsDb.map((tx, index) => ({
      id: index + 1,
      debtor_id: customerIdToIndex.get(tx.customerId.toString()),
      type: tx.type,
      amount: tx.amount,
      note: tx.note ?? '',
      date: tx.date.getTime(),
      created_at: tx.createdAt.getTime(),
    }));

    return {
      timestamp: new Date().toISOString(),
      version: BACKUP_VERSION,
      debtors,
      transactions,
    };
  }

  // =========================================================================
  //  IMPORT (orchestration only — logic lives in private helpers)
  // =========================================================================

  async importBackup(file: any, userId: string) {
    if (!file) {
      throw new BadRequestException('Backup file is required.');
    }

    const objectUserId = new Types.ObjectId(userId);
    const backup = this.validateBackup(this.parseBackup(file));

    // 1) Customers: load once into a Map, reuse when matched, bulk insert new.
    const existingCustomers = await this.loadExistingCustomers(objectUserId);
    const { remap, insertedCount } = await this.importCustomers(
      backup.debtors,
      objectUserId,
      existingCustomers,
    );

    // 2) Transactions: load once into a Set, bulk insert the unique ones.
    const existingTransactionKeys =
      await this.loadExistingTransactionKeys(objectUserId);
    const candidateTransactions = this.buildTransactionDocuments(
      backup.transactions,
      remap,
      objectUserId,
    );
    const newTransactions = this.filterDuplicateTransactions(
      candidateTransactions,
      existingTransactionKeys,
    );

    await this.importTransactions(newTransactions);

    // 3) Recalculate stats for every affected customer in a single bulkWrite.
    await this.recalculateCustomerStats(newTransactions);

    return {
      success: true,
      importedCustomers: insertedCount,
      importedTransactions: newTransactions.length,
      message: 'Backup imported successfully.',
    };
  }

  // =========================================================================
  //  Parsing & Validation
  // =========================================================================

  private parseBackup(file: any): BackupPayload {
    let raw: string;
    try {
      raw = file.buffer.toString('utf8');
    } catch {
      throw new BadRequestException('Invalid JSON file.');
    }
    try {
      return JSON.parse(raw) as BackupPayload;
    } catch {
      throw new BadRequestException('Invalid JSON file.');
    }
  }

  private validateBackup(payload: BackupPayload): BackupPayload {
    if (
      !payload ||
      !Array.isArray(payload.debtors) ||
      !Array.isArray(payload.transactions)
    ) {
      throw new BadRequestException('Invalid backup format.');
    }
    return payload;
  }

  // =========================================================================
  //  Normalization helpers
  // =========================================================================

  private normalize(value: string | null | undefined): string {
    if (!value) return '';
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private normalizePhone(phone: string | null | undefined): string {
    if (!phone) return '';
    return phone.replace(/\D/g, '');
  }

  /**
   * Business rule: a customer is identical when createdBy + fullName +
   * phone + location match AFTER normalization. Different locations are
   * treated as different customers.
   */
  private buildCustomerKey(
    fullName: string,
    phone: string,
    location: string,
  ): string {
    return [
      this.normalize(fullName),
      this.normalizePhone(phone),
      this.normalize(location),
    ].join(KEY_DELIMITER);
  }

  /**
   * Business rule: a transaction is a duplicate when customerId + type +
   * amount + date + note all match.
   */
  private buildTransactionKey(
    customerId: Types.ObjectId,
    type: string,
    amount: number,
    date: Date,
    note: string | null,
  ): string {
    return [
      customerId.toString(),
      type,
      String(amount),
      String(date.getTime()),
      note ?? '',
    ].join(KEY_DELIMITER);
  }

  // =========================================================================
  //  Customer import (smart + bulk)
  // =========================================================================

  private async loadExistingCustomers(
    userId: Types.ObjectId,
  ): Promise<Map<string, LeanCustomer>> {
    const customers = (await this.customerModel
      .find({ createdBy: userId, isDeleted: false })
      .lean()) as LeanCustomer[];

    const map = new Map<string, LeanCustomer>();
    for (const customer of customers) {
      const key = this.buildCustomerKey(
        customer.fullName,
        customer.phone,
        customer.location ?? '',
      );
      // Keep only the first occurrence if a data anomaly ever produced dupes.
      if (!map.has(key)) {
        map.set(key, customer);
      }
    }
    return map;
  }

  private async importCustomers(
    debtors: DebtorDto[],
    userId: Types.ObjectId,
    existingCustomers: Map<string, LeanCustomer>,
  ): Promise<{ remap: Map<number, Types.ObjectId>; insertedCount: number }> {
    const remap = new Map<number, Types.ObjectId>();
    const toInsert: Array<{ debtorId: number; doc: CustomerDocumentPayload }> =
      [];

    for (const debtor of debtors) {
      const key = this.buildCustomerKey(
        debtor.name,
        debtor.phone,
        debtor.location ?? '',
      );
      const existing = existingCustomers.get(key);
      if (existing) {
        remap.set(debtor.id, existing._id);
        continue;
      }
      toInsert.push({
        debtorId: debtor.id,
        doc: this.buildCustomerDocument(debtor, userId),
      });
    }

    let insertedCount = 0;
    if (toInsert.length > 0) {
      const inserted = await this.customerModel.insertMany(
        toInsert.map((item) => item.doc),
      );
      insertedCount = inserted.length;
      inserted.forEach((customer, index) => {
        remap.set(toInsert[index].debtorId, customer._id as Types.ObjectId);
      });
    }

    return { remap, insertedCount };
  }

  private buildCustomerDocument(
    debtor: DebtorDto,
    userId: Types.ObjectId,
  ): CustomerDocumentPayload {
    const createdAt = new Date(debtor.created_at);
    return {
      fullName: debtor.name,
      phone: debtor.phone,
      location: debtor.location ?? null,
      note: debtor.note ?? null,
      createdBy: userId,
      balance: 0,
      totalDebt: 0,
      totalPaid: 0,
      isDeleted: false,
      createdAt,
      updatedAt: createdAt,
    };
  }

  // =========================================================================
  //  Transaction import (dedup + bulk)
  // =========================================================================

  private async loadExistingTransactionKeys(
    userId: Types.ObjectId,
  ): Promise<Set<string>> {
    const transactions = (await this.transactionModel
      .find({ createdBy: userId, isDeleted: false })
      .lean()) as LeanTransaction[];

    const keys = new Set<string>();
    for (const tx of transactions) {
      keys.add(
        this.buildTransactionKey(
          tx.customerId,
          tx.type,
          tx.amount,
          tx.date,
          tx.note ?? '',
        ),
      );
    }
    return keys;
  }

  private buildTransactionDocuments(
    backupTransactions: TransactionDto[],
    customerRemap: Map<number, Types.ObjectId>,
    userId: Types.ObjectId,
  ): TransactionDocumentPayload[] {
    const documents: TransactionDocumentPayload[] = [];

    for (const tx of backupTransactions) {
      const customerId = customerRemap.get(tx.debtor_id);
      // Skip orphan transactions (their debtor was missing / failed to insert).
      if (!customerId) continue;

      const createdAt = new Date(tx.created_at);
      documents.push({
        customerId,
        type: tx.type,
        amount: tx.amount,
        note: tx.note ?? null,
        date: new Date(tx.date),
        createdBy: userId,
        isDeleted: false,
        createdAt,
        updatedAt: createdAt,
      });
    }

    return documents;
  }

  private filterDuplicateTransactions(
    candidateTransactions: TransactionDocumentPayload[],
    existingKeys: Set<string>,
  ): TransactionDocumentPayload[] {
    const seenInBatch = new Set<string>();
    const result: TransactionDocumentPayload[] = [];

    for (const tx of candidateTransactions) {
      const key = this.buildTransactionKey(
        tx.customerId,
        tx.type,
        tx.amount,
        tx.date,
        tx.note ?? '',
      );
      // Skip anything already in DB, or already accepted in this same batch.
      if (existingKeys.has(key) || seenInBatch.has(key)) continue;
      seenInBatch.add(key);
      result.push(tx);
    }

    return result;
  }

  private async importTransactions(
    documents: TransactionDocumentPayload[],
  ): Promise<void> {
    if (documents.length === 0) return;
    await this.transactionModel.insertMany(documents);
  }

  // =========================================================================
  //  Customer stats recalculation (single bulkWrite)
  // =========================================================================

  private async recalculateCustomerStats(
    newTransactions: TransactionDocumentPayload[],
  ): Promise<void> {
    if (newTransactions.length === 0) return;

    const affectedCustomerIds = Array.from(
      new Set(newTransactions.map((tx) => tx.customerId.toString())),
    ).map((id) => new Types.ObjectId(id));

    // Load ALL transactions (existing + newly inserted) for the affected
    // customers in a single query — guarantees correct stats when reusing
    // customers that already had their own history.
    const allTransactions = (await this.transactionModel
      .find({
        customerId: { $in: affectedCustomerIds },
        isDeleted: false,
      })
      .lean()) as LeanTransaction[];

    const stats = this.aggregateCustomerStats(allTransactions);

    const bulkOps = [...stats.entries()].map(([customerId, stat]) => ({
      updateOne: {
        filter: { _id: new Types.ObjectId(customerId) },
        update: {
          $set: {
            totalDebt: stat.totalDebt,
            totalPaid: stat.totalPaid,
            balance: stat.totalDebt - stat.totalPaid,
            lastTransactionAt: stat.lastTransactionAt,
            lastPaymentAt: stat.lastPaymentAt,
          },
        },
      },
    }));

    if (bulkOps.length > 0) {
      await this.customerModel.bulkWrite(bulkOps, { ordered: false });
    }
  }

  private aggregateCustomerStats(
    transactions: LeanTransaction[],
  ): Map<string, CustomerStat> {
    const stats = new Map<string, CustomerStat>();

    for (const tx of transactions) {
      const key = tx.customerId.toString();
      if (!stats.has(key)) {
        stats.set(key, {
          totalDebt: 0,
          totalPaid: 0,
          lastTransactionAt: null,
          lastPaymentAt: null,
        });
      }
      const stat = stats.get(key)!;

      // lastTransactionAt = latest date among ALL transactions.
      if (!stat.lastTransactionAt || tx.date > stat.lastTransactionAt) {
        stat.lastTransactionAt = tx.date;
      }

      if (tx.type === TRANSACTION_TYPE_DEBT) {
        stat.totalDebt += tx.amount;
      } else {
        // Preserve original semantics: any non-debt transaction is a payment.
        stat.totalPaid += tx.amount;
        if (!stat.lastPaymentAt || tx.date > stat.lastPaymentAt) {
          stat.lastPaymentAt = tx.date;
        }
      }
    }

    return stats;
  }
}
