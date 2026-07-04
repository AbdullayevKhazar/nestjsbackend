import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

import { TransactionType } from '../enum/transaction-type.enum';
import { Customer } from '../../customers/schemas/customer.schema';
import { User } from '../../users/schemas/user.schema';

export type TransactionDocument = HydratedDocument<Transaction>;

@Schema({
  timestamps: true,
})
export class Transaction {
  @Prop({
    type: Types.ObjectId,
    ref: Customer.name,
    required: true,
  })
  customerId!: Types.ObjectId;

  @Prop({
    enum: TransactionType,
    required: true,
  })
  type!: TransactionType;

  @Prop({
    required: true,
    min: 0,
  })
  amount!: number;

  @Prop({
    type: String,
    trim: true,
    default: null,
  })
  note?: string | null;

  @Prop({
    required: true,
  })
  date!: Date;

  @Prop({
    type: Types.ObjectId,
    ref: User.name,
    required: true,
  })
  createdBy!: Types.ObjectId;

  @Prop({
    default: false,
  })
  isDeleted!: boolean;

  @Prop({
    type: Date,
    default: null,
  })
  deletedAt?: Date | null;

  createdAt!: Date;

  updatedAt!: Date;
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);

TransactionSchema.index({ createdBy: 1, isDeleted: 1, date: -1 });
TransactionSchema.index({ customerId: 1, isDeleted: 1, date: -1 });
TransactionSchema.index({ createdBy: 1, isDeleted: 1, type: 1 });
