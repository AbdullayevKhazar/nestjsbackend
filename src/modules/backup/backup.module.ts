import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';

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
  controllers: [BackupController],
  providers: [BackupService],
})
export class BackupModule {}
