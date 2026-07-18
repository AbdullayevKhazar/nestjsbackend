import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

import { Customer } from '../../customers/schemas/customer.schema';

export type ReminderLogDocument = HydratedDocument<ReminderLog>;

export enum ReminderStatus {
  SENT = 'sent',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

@Schema({
  timestamps: true,
})
export class ReminderLog {
  @Prop({
    type: Types.ObjectId,
    ref: Customer.name,
    required: true,
    index: true,
  })
  customerId!: Types.ObjectId;

  @Prop({
    type: String,
    enum: ReminderStatus,
    required: true,
  })
  status!: ReminderStatus;

  @Prop({
    type: String,
    default: null,
  })
  providerResponse?: string | null;

  @Prop({
    type: String,
    default: null,
  })
  error?: string | null;

  @Prop({
    type: String,
    default: null,
  })
  messageContent?: string | null;

  @Prop({
    type: Boolean,
    default: false,
  })
  isFirstReminder!: boolean;

  createdAt!: Date;

  updatedAt!: Date;
}

export const ReminderLogSchema = SchemaFactory.createForClass(ReminderLog);

ReminderLogSchema.index({ customerId: 1, createdAt: -1 });
ReminderLogSchema.index({ status: 1, createdAt: -1 });
