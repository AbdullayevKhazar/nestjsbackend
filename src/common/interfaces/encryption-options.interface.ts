/**
 * Options passed to the Mongoose encryption plugin.
 */
export interface EncryptionPluginOptions {
  /** Field paths to encrypt / decrypt transparently. */
  fields: string[];

  /** Encrypt a plaintext value into a versioned ciphertext string. */
  encrypt: (value: unknown) => string;

  /** Decrypt a versioned ciphertext string back to the original value. */
  decrypt: <T>(value: string) => T;

  /** Predicate that returns true if a value is already encrypted. */
  isEncrypted: (value: unknown) => boolean;
}
