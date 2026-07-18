import 'reflect-metadata';

export const ENCRYPTED_FIELDS_KEY = 'encrypted:fields';

/**
 * Marks a Mongoose schema field for transparent AES-256-GCM encryption.
 *
 * Usage:
 *   @Schema()
 *   class Customer {
 *     @Encrypted()
 *     @Prop({ type: Number, default: 0 })
 *     balance!: number;
 *   }
 */
export function Encrypted(): PropertyDecorator {
  return (target: object, propertyKey: string | symbol) => {
    const existing: string[] =
      Reflect.getMetadata(ENCRYPTED_FIELDS_KEY, target) ?? [];

    if (!existing.includes(propertyKey as string)) {
      Reflect.defineMetadata(
        ENCRYPTED_FIELDS_KEY,
        [...existing, propertyKey as string],
        target,
      );
    }
  };
}

/**
 * Retrieve all encrypted field names from a class prototype.
 */
export function getEncryptedFields(target: object): string[] {
  return Reflect.getMetadata(ENCRYPTED_FIELDS_KEY, target) ?? [];
}
