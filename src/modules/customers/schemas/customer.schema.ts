import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from 'src/modules/users/schemas/user.schema';

export type CustomerDocument = HydratedDocument<Customer>;
@Schema({
  timestamps: true,
})
export class Customer {
  @Prop({
    required: true,
    trim: true,
  })
  fullName!: string;

  @Prop({
    required: true,
    trim: true,
  })
  phone!: string;

  @Prop({
    type: String,
    default: null,
    trim: true,
  })
  location?: string | null;

  @Prop({
    type: String,
    default: null,
    trim: true,
  })
  note?: string | null;

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
    type: Number,
    default: 0,
  })
  balance!: number;

  @Prop({
    type: Number,
    default: 0,
    min: 0,
  })
  totalDebt!: number;

  @Prop({
    type: Number,
    default: 0,
    min: 0,
  })
  totalPaid!: number;

  @Prop({
    type: Date,
    default: null,
  })
  lastTransactionAt?: Date | null;

  @Prop({
    type: Date,
    default: null,
  })
  lastPaymentAt?: Date | null;

  @Prop({
    type: Date,
    default: null,
  })
  deletedAt?: Date | null;
}

export const CustomerSchema = SchemaFactory.createForClass(Customer);

CustomerSchema.index({
  createdBy: 1,
  isDeleted: 1,
});

CustomerSchema.index({
  fullName: 1,
});

CustomerSchema.index({
  phone: 1,
});
