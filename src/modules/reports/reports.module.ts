import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportProjectionsService } from './report-projections.service';

import {
  Customer,
  CustomerSchema,
  configureCustomerSchema,
} from '../customers/schemas/customer.schema';
import {
  Transaction,
  TransactionSchema,
  configureTransactionSchema,
} from '../transactions/schemas/transaction.schema';
import {
  DailySummary,
  DailySummarySchema,
} from './schemas/daily-summary.schema';
import {
  CustomerSnapshot,
  CustomerSnapshotSchema,
} from './schemas/customer-snapshot.schema';
import { EncryptionService } from '../encryption/encryption.service';
import { FinancialEventsModule } from '../events/financial-events.module';

@Module({
  imports: [
    MongooseModule.forFeatureAsync([
      {
        name: Customer.name,
        useFactory: (encryptionService: EncryptionService) => {
          configureCustomerSchema(CustomerSchema, encryptionService);
          return CustomerSchema;
        },
        inject: [EncryptionService],
      },
      {
        name: Transaction.name,
        useFactory: (encryptionService: EncryptionService) => {
          configureTransactionSchema(TransactionSchema, encryptionService);
          return TransactionSchema;
        },
        inject: [EncryptionService],
      },
      {
        name: DailySummary.name,
        useFactory: () => DailySummarySchema,
      },
      {
        name: CustomerSnapshot.name,
        useFactory: () => CustomerSnapshotSchema,
      },
    ]),
    FinancialEventsModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService, ReportProjectionsService],
})
export class ReportsModule {}
