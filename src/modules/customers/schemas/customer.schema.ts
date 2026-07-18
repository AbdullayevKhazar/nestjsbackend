import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from 'src/modules/users/schemas/user.schema';
import { Encrypted } from 'src/common/decorators/encrypted.decorator';
import { EncryptionService } from 'src/modules/encryption/encryption.service';
import { applyEncryptionPlugin } from 'src/common/plugins/mongoose-encryption.plugin';

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

  /**
   * Encrypted current balance.
   * Stored as AES-256-GCM ciphertext at rest.
   * Type is string | number because the value is a number at creation time
   * and becomes an encrypted string after the pre-save hook runs.
   */
  @Encrypted()
  @Prop({
    type: String,
    default: null,
  })
  balance!: string | number;

  /**
   * Encrypted total debt accumulated.
   */
  @Encrypted()
  @Prop({
    type: String,
    default: null,
  })
  totalDebt!: string | number;

  /**
   * Encrypted total payments received.
   */
  @Encrypted()
  @Prop({
    type: String,
    default: null,
  })
  totalPaid!: string | number;

  /**
   * Non-encrypted boolean flag for fast querying.
   * Must be kept in sync with balance by business logic.
   */
  @Prop({
    type: Boolean,
    default: false,
    index: true,
  })
  hasDebt!: boolean;

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

  @Prop({
    default: () => crypto.randomUUID(),
    unique: true,
    index: true,
    Type: String,
  })
  publicToken?: string;

  @Prop({
    Type: Boolean,
    default: true,
  })
  isPublic?: boolean;

  @Prop({
    type: Date,
    default: null,
  })
  lastReminderSentAt?: Date | null;

  @Prop({
    type: Boolean,
    default: true,
  })
  reminderEnabled!: boolean;

  createdAt!: Date;

  updatedAt!: Date;
}

export const CustomerSchema = SchemaFactory.createForClass(Customer);

CustomerSchema.index({
  createdBy: 1,
  isDeleted: 1,
});

CustomerSchema.index({
  createdBy: 1,
  isDeleted: 1,
  location: 1,
});

CustomerSchema.index({
  createdBy: 1,
  isDeleted: 1,
  hasDebt: 1,
  lastPaymentAt: 1,
});

CustomerSchema.index({
  createdBy: 1,
  isDeleted: 1,
  fullName: 1,
});

CustomerSchema.index({
  createdBy: 1,
  isDeleted: 1,
  createdAt: -1,
});

CustomerSchema.index({
  createdBy: 1,
  isDeleted: 1,
  lastTransactionAt: -1,
});

CustomerSchema.index({
  fullName: 1,
});

CustomerSchema.index({
  phone: 1,
});

CustomerSchema.index({
  fullName: 'text',
  phone: 'text',
  location: 'text',
});

CustomerSchema.index({
  isDeleted: 1,
  reminderEnabled: 1,
  hasDebt: 1,
  lastReminderSentAt: 1,
});

/**
 * Factory to apply the encryption plugin.
 * Called once during module initialization.
 */
export function configureCustomerSchema(
  schema: typeof CustomerSchema,
  encryptionService: EncryptionService,
): void {
  const beforeMiddleware = (schema as any)._middleware;
  const beforePreCount = beforeMiddleware?.pre?.length ?? 0;
  const beforePostCount = beforeMiddleware?.post?.length ?? 0;
  // eslint-disable-next-line no-console
  console.log(
    `[DEBUG-SCHEMA] configureCustomerSchema() called. ` +
      `Schema has ${beforePreCount} pre-hooks ` +
      `and ${beforePostCount} post-hooks before plugin application.`,
  );
  applyEncryptionPlugin(schema, {
    fields: ['balance', 'totalDebt', 'totalPaid'],
    encrypt: (value) => encryptionService.encrypt(value),
    decrypt: <T>(value: string) => encryptionService.decrypt<T>(value),
    isEncrypted: (value) => encryptionService.isEncrypted(value),
  });
  const afterMiddleware = (schema as any)._middleware;
  const afterPreCount = afterMiddleware?.pre?.length ?? 0;
  const afterPostCount = afterMiddleware?.post?.length ?? 0;
  // eslint-disable-next-line no-console
  console.log(
    `[DEBUG-SCHEMA] configureCustomerSchema() complete. ` +
      `Schema now has ${afterPreCount} pre-hooks ` +
      `and ${afterPostCount} post-hooks.`,
  );
}
