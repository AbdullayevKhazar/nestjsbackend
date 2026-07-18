import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type DailySummaryDocument = HydratedDocument<DailySummary>;

/**
 * Pre-computed daily financial summary per user.
 *
 * All monetary totals are stored encrypted at rest.
 * MongoDB queries only on non-encrypted dimensions (userId, date).
 * Application layer decrypts and sums values when serving reports.
 *
 * This is the read-model side of our CQRS architecture.
 */
@Schema({ timestamps: true })
export class DailySummary {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;

  /**
   * Date at midnight UTC (no time component).
   */
  @Prop({ type: Date, required: true, index: true })
  date!: Date;

  /**
   * Encrypted total debt added on this day.
   */
  @Prop({ type: String, default: null })
  totalDebtAdded?: string | null;

  /**
   * Encrypted total payments received on this day.
   */
  @Prop({ type: String, default: null })
  totalPaymentReceived?: string | null;

  /**
   * Encrypted net change (debt added - payments received).
   */
  @Prop({ type: String, default: null })
  netChange?: string | null;

  /**
   * Encrypted outstanding balance at end of day.
   */
  @Prop({ type: String, default: null })
  endOfDayBalance?: string | null;

  /**
   * Non-encrypted counters for quick insights.
   */
  @Prop({ type: Number, default: 0 })
  transactionCount!: number;

  @Prop({ type: Number, default: 0 })
  debtTransactionCount!: number;

  @Prop({ type: Number, default: 0 })
  paymentTransactionCount!: number;

  @Prop({ type: Number, default: 0 })
  activeCustomerCount!: number;

  createdAt!: Date;
  updatedAt!: Date;
}

export const DailySummarySchema = SchemaFactory.createForClass(DailySummary);

DailySummarySchema.index({ userId: 1, date: -1 });
DailySummarySchema.index({ userId: 1, date: 1 });
