import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type FinancialEventDocument = HydratedDocument<FinancialEvent>;

/**
 * Event types for the financial event store.
 */
export enum FinancialEventType {
  DEBT_INCREASED = 'debt_increased',
  PAYMENT_INCREASED = 'payment_increased',
  DEBT_ROLLED_BACK = 'debt_rolled_back',
  PAYMENT_ROLLED_BACK = 'payment_rolled_back',
  CUSTOMER_CREATED = 'customer_created',
  CUSTOMER_DELETED = 'customer_deleted',
  TRANSACTION_CREATED = 'transaction_created',
  TRANSACTION_UPDATED = 'transaction_updated',
  TRANSACTION_DELETED = 'transaction_deleted',
}

/**
 * Immutable financial event for audit trail and projection rebuilds.
 *
 * All monetary values are stored encrypted at rest.
 * The event store is append-only and provides the source of truth
 * for recalculating any report or snapshot.
 */
@Schema({ timestamps: true })
export class FinancialEvent {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  customerId!: Types.ObjectId;

  @Prop({
    type: String,
    enum: FinancialEventType,
    required: true,
    index: true,
  })
  eventType!: FinancialEventType;

  /**
   * Encrypted amount associated with the event.
   * JSON-stringified number encrypted with AES-256-GCM.
   */
  @Prop({ type: String, required: true })
  amount!: string;

  /**
   * Encrypted running balance snapshot after this event.
   * Allows fast point-in-time reconstruction without aggregating all events.
   */
  @Prop({ type: String, default: null })
  balanceSnapshot?: string | null;

  /**
   * Encrypted running totalDebt snapshot after this event.
   */
  @Prop({ type: String, default: null })
  totalDebtSnapshot?: string | null;

  /**
   * Encrypted running totalPaid snapshot after this event.
   */
  @Prop({ type: String, default: null })
  totalPaidSnapshot?: string | null;

  /**
   * Optional reference to the transaction that caused this event.
   */
  @Prop({ type: Types.ObjectId, default: null, index: true })
  transactionId?: Types.ObjectId | null;

  /**
   * Optional metadata for debugging / audit.
   */
  @Prop({ type: Object, default: null })
  metadata?: Record<string, unknown> | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const FinancialEventSchema = SchemaFactory.createForClass(FinancialEvent);

FinancialEventSchema.index({ userId: 1, customerId: 1, createdAt: -1 });
FinancialEventSchema.index({ userId: 1, createdAt: -1 });
FinancialEventSchema.index({ transactionId: 1 });
