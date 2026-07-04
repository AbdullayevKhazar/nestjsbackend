import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { PublicController } from './public.controller';
import { PublicService } from './public.service';

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
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
