import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { MigrationController } from './migration.controller';
import { MigrationService } from './migration.service';

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
import { EncryptionService } from '../encryption/encryption.service';

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
    ]),
  ],
  controllers: [MigrationController],
  providers: [MigrationService],
  exports: [MigrationService],
})
export class MigrationModule {}
