import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EncryptionService } from '../encryption/encryption.service';
import {
  Customer,
  CustomerDocument,
} from '../customers/schemas/customer.schema';
import {
  Transaction,
  TransactionDocument,
} from '../transactions/schemas/transaction.schema';

export interface MigrationResult {
  customersProcessed: number;
  customersUpdated: number;
  transactionsProcessed: number;
  transactionsUpdated: number;
  errors: string[];
}

/**
 * Migration service for encrypting existing plaintext financial data.
 *
 * When encryption is first enabled, existing documents may have plaintext
 * numbers in financial fields. This service iterates all documents,
 * detects plaintext values, and re-saves them so the encryption plugin
 * converts them to ciphertext.
 *
 * It is idempotent: running it twice on already-encrypted data is a no-op.
 */
@Injectable()
export class MigrationService implements OnModuleInit {
  private readonly logger = new Logger(MigrationService.name);

  constructor(
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,

    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<TransactionDocument>,

    private readonly encryptionService: EncryptionService,
  ) {}

  onModuleInit() {
    this.logger.log('MigrationService ready');
  }

  /**
   * Run the migration for all financial fields.
   *
   * Process:
   * 1. Fetch documents in batches
   * 2. Check if financial fields are plaintext (not encrypted)
   * 3. If plaintext, trigger save() so the encryption plugin encrypts them
   * 4. Track statistics
   */
  async runMigration(batchSize = 100): Promise<MigrationResult> {
    const result: MigrationResult = {
      customersProcessed: 0,
      customersUpdated: 0,
      transactionsProcessed: 0,
      transactionsUpdated: 0,
      errors: [],
    };

    this.logger.log('Starting financial field encryption migration...');
    // eslint-disable-next-line no-console
    console.log(
      `[DEBUG-MIGRATION] runMigration() START. ` +
        `Note: initial .find() uses .lean() — docs are plain objects. ` +
        `Re-encryption uses findById() + save() which DOES trigger pre('save').`,
    );

    // -----------------------------------------------------------------------
    // Migrate Customers
    // -----------------------------------------------------------------------
    let customerSkip = 0;
    let customerBatch: CustomerDocument[];

    do {
      customerBatch = await this.customerModel
        .find()
        .skip(customerSkip)
        .limit(batchSize)
        .lean();

      // eslint-disable-next-line no-console
      console.log(
        `[DEBUG-MIGRATION] Customer batch: skip=${customerSkip}, count=${customerBatch.length}`,
      );

      for (const customer of customerBatch) {
        result.customersProcessed++;

        try {
          const b = (customer as any).balance;
          const td = (customer as any).totalDebt;
          const tp = (customer as any).totalPaid;
          const needsEncryption =
            !this.encryptionService.isEncrypted(b) ||
            !this.encryptionService.isEncrypted(td) ||
            !this.encryptionService.isEncrypted(tp);

          if (needsEncryption) {
            // eslint-disable-next-line no-console
            console.log(
              `[DEBUG-MIGRATION] Customer ${customer._id} needs encryption. ` +
                `balance=${typeof b}, totalDebt=${typeof td}, totalPaid=${typeof tp}`,
            );
            const doc = await this.customerModel.findById(customer._id);
            if (doc) {
              // The pre-save hook will encrypt the fields
              await doc.save();
              result.customersUpdated++;
              // eslint-disable-next-line no-console
              console.log(
                `[DEBUG-MIGRATION] Customer ${customer._id} re-saved. ` +
                  `Post-save balance=${JSON.stringify((doc as any).balance)}`,
              );
            }
          }
        } catch (err: any) {
          const msg = `Customer ${customer._id}: ${err.message}`;
          this.logger.error(msg);
          result.errors.push(msg);
        }
      }

      customerSkip += batchSize;
    } while (customerBatch.length === batchSize);

    // -----------------------------------------------------------------------
    // Migrate Transactions
    // -----------------------------------------------------------------------
    let transactionSkip = 0;
    let transactionBatch: TransactionDocument[];

    do {
      transactionBatch = await this.transactionModel
        .find()
        .skip(transactionSkip)
        .limit(batchSize)
        .lean();

      // eslint-disable-next-line no-console
      console.log(
        `[DEBUG-MIGRATION] Transaction batch: skip=${transactionSkip}, count=${transactionBatch.length}`,
      );

      for (const transaction of transactionBatch) {
        result.transactionsProcessed++;

        try {
          const amt = (transaction as any).amount;
          const needsEncryption = !this.encryptionService.isEncrypted(amt);

          if (needsEncryption) {
            // eslint-disable-next-line no-console
            console.log(
              `[DEBUG-MIGRATION] Transaction ${transaction._id} needs encryption. amount=${typeof amt}`,
            );
            const doc = await this.transactionModel.findById(transaction._id);
            if (doc) {
              await doc.save();
              result.transactionsUpdated++;
              // eslint-disable-next-line no-console
              console.log(
                `[DEBUG-MIGRATION] Transaction ${transaction._id} re-saved. amount=${JSON.stringify((doc as any).amount)}`,
              );
            }
          }
        } catch (err: any) {
          const msg = `Transaction ${transaction._id}: ${err.message}`;
          this.logger.error(msg);
          result.errors.push(msg);
        }
      }

      transactionSkip += batchSize;
    } while (transactionBatch.length === batchSize);

    this.logger.log(
      `Migration complete. Customers: ${result.customersUpdated}/${result.customersProcessed} updated. ` +
        `Transactions: ${result.transactionsUpdated}/${result.transactionsProcessed} updated. ` +
        `Errors: ${result.errors.length}`,
    );
    // eslint-disable-next-line no-console
    console.log(
      `[DEBUG-MIGRATION] runMigration() END.`,
      JSON.stringify(result),
    );

    return result;
  }

  /**
   * Verify that all financial fields are encrypted.
   * Returns true if no plaintext values remain.
   */
  async verifyEncryption(): Promise<{
    isFullyEncrypted: boolean;
    plaintextCustomers: number;
    plaintextTransactions: number;
  }> {
    const allCustomers = await this.customerModel.find().lean();
    const allTransactions = await this.transactionModel.find().lean();

    let plaintextCustomers = 0;
    let plaintextTransactions = 0;

    for (const customer of allCustomers) {
      if (
        !this.encryptionService.isEncrypted((customer as any).balance) ||
        !this.encryptionService.isEncrypted((customer as any).totalDebt) ||
        !this.encryptionService.isEncrypted((customer as any).totalPaid)
      ) {
        plaintextCustomers++;
      }
    }

    for (const transaction of allTransactions) {
      if (!this.encryptionService.isEncrypted((transaction as any).amount)) {
        plaintextTransactions++;
      }
    }

    return {
      isFullyEncrypted: plaintextCustomers === 0 && plaintextTransactions === 0,
      plaintextCustomers,
      plaintextTransactions,
    };
  }
}
