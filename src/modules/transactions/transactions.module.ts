import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

import {
  Transaction,
  TransactionSchema,
  configureTransactionSchema,
} from './schemas/transaction.schema';
import {
  Customer,
  CustomerSchema,
  configureCustomerSchema,
} from '../customers/schemas/customer.schema';
import { EncryptionService } from '../encryption/encryption.service';
import { CustomersModule } from '../customers/customers.module';
import { ReportProjectionsService } from '../reports/report-projections.service';
import {
  CustomerSnapshot,
  CustomerSnapshotSchema,
} from '../reports/schemas/customer-snapshot.schema';
import {
  DailySummary,
  DailySummarySchema,
} from '../reports/schemas/daily-summary.schema';
import { FinancialEventsModule } from '../events/financial-events.module';

@Module({
  imports: [
    MongooseModule.forFeatureAsync([
      {
        name: Transaction.name,
        useFactory: (encryptionService: EncryptionService) => {
          configureTransactionSchema(TransactionSchema, encryptionService);
          return TransactionSchema;
        },
        inject: [EncryptionService],
      },
      {
        name: Customer.name,
        useFactory: (encryptionService: EncryptionService) => {
          configureCustomerSchema(CustomerSchema, encryptionService);
          return CustomerSchema;
        },
        inject: [EncryptionService],
      },
      {
        name: CustomerSnapshot.name,
        useFactory: () => CustomerSnapshotSchema,
      },
      {
        name: DailySummary.name,
        useFactory: () => DailySummarySchema,
      },
    ]),
    CustomersModule,
    FinancialEventsModule,
  ],
  controllers: [TransactionsController],
  providers: [TransactionsService, ReportProjectionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
