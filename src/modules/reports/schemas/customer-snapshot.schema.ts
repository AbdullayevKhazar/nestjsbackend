import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CustomerSnapshotDocument = HydratedDocument<CustomerSnapshot>;

/**
 * Pre-computed per-customer financial snapshot.
 *
 * This read-model avoids the need to aggregate transactions at query time.
 * It is updated synchronously when transactions change.
 *
 * All monetary values are encrypted at rest.
 */
@Schema({ timestamps: true })
export class CustomerSnapshot {
  @Prop({ type: Types.ObjectId, required: true, index: true, unique: true })
  customerId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;

  /**
   * Encrypted current balance.
   */
  @Prop({ type: String, default: null })
  balance?: string | null;

  /**
   * Encrypted total debt accumulated.
   */
  @Prop({ type: String, default: null })
  totalDebt?: string | null;

  /**
   * Encrypted total payments received.
   */
  @Prop({ type: String, default: null })
  totalPaid?: string | null;

  /**
   * Non-encrypted flag for fast filtering.
   * Updated by the business layer whenever balance changes.
   */
  @Prop({ type: Boolean, default: false, index: true })
  hasDebt!: boolean;

  @Prop({ type: Number, default: 0 })
  transactionCount!: number;

  @Prop({ type: Date, default: null })
  lastTransactionAt?: Date | null;

  @Prop({ type: Date, default: null })
  lastPaymentAt?: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const CustomerSnapshotSchema = SchemaFactory.createForClass(CustomerSnapshot);

CustomerSnapshotSchema.index({ userId: 1, hasDebt: 1 });
