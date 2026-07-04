import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';

import { Customer, CustomerSchema } from '../customers/schemas/customer.schema';

import {
  Transaction,
  TransactionSchema,
} from '../transactions/schemas/transaction.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Customer.name,
        schema: CustomerSchema,
      },
      {
        name: Transaction.name,
        schema: TransactionSchema,
      },
    ]),
  ],
  controllers: [BackupController],
  providers: [BackupService],
})
export class BackupModule {}
