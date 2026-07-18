import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

import {
  Customer,
  CustomerSchema,
  configureCustomerSchema,
} from './schemas/customer.schema';
import {
  Transaction,
  TransactionSchema,
  configureTransactionSchema,
} from '../transactions/schemas/transaction.schema';
import { EncryptionService } from '../encryption/encryption.service';
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
        name: CustomerSnapshot.name,
        useFactory: () => CustomerSnapshotSchema,
      },
      {
        name: DailySummary.name,
        useFactory: () => DailySummarySchema,
      },
    ]),
    FinancialEventsModule,
  ],
  controllers: [CustomersController],
  providers: [CustomersService, ReportProjectionsService],
  exports: [CustomersService],
})
export class CustomersModule {}
