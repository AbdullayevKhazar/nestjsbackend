import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, Schema as MongooseSchema } from 'mongoose';

import { TransactionType } from '../enum/transaction-type.enum';
import { Customer } from '../../customers/schemas/customer.schema';
import { User } from '../../users/schemas/user.schema';
import { Encrypted } from 'src/common/decorators/encrypted.decorator';
import { EncryptionService } from 'src/modules/encryption/encryption.service';
import { applyEncryptionPlugin } from 'src/common/plugins/mongoose-encryption.plugin';

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

  /**
   * Encrypted transaction amount.
   * Stored as AES-256-GCM ciphertext at rest.
   * Type is string | number because the value is a number at creation time
   * and becomes an encrypted string after the pre-save hook runs.
   */
  @Encrypted()
  @Prop({
    type: String,
    required: true,
  })
  amount!: string | number;

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

/**
 * Factory to apply the encryption plugin.
 * Called once during module initialization.
 */
/**
 * Factory to apply the encryption plugin.
 * Called once during module initialization.
 */
export function configureTransactionSchema(
  schema: MongooseSchema,
  encryptionService: EncryptionService,
): void {
  const middleware = (schema as any)._middleware;
  // eslint-disable-next-line no-console
  console.log(
    `[DEBUG-SCHEMA] configureTransactionSchema() called. ` +
      `Schema has ${middleware?.pre?.length || 0} pre-hooks ` +
      `and ${middleware?.post?.length || 0} post-hooks before plugin application.`,
  );
  applyEncryptionPlugin(schema, {
    fields: ['amount'],
    encrypt: (value) => encryptionService.encrypt(value),
    decrypt: <T>(value: string) => encryptionService.decrypt<T>(value),
    isEncrypted: (value) => encryptionService.isEncrypted(value),
  });
  // eslint-disable-next-line no-console
  console.log(
    `[DEBUG-SCHEMA] configureTransactionSchema() complete. ` +
      `Schema now has ${middleware?.pre?.length || 0} pre-hooks ` +
      `and ${middleware?.post?.length || 0} post-hooks.`,
  );
}
