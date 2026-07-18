import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from 'crypto';
import encryptionConfig from '../../config/encryption.config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

interface EncryptedPayload {
  version: string;
  iv: string;
  authTag: string;
  ciphertext: string;
}

/**
 * Fintech-grade AES-256-GCM encryption service.
 *
 * Features:
 * - Key derivation via SHA-256 (any-length ENCRYPTION_KEY → 32-byte key)
 * - Per-field random IV
 * - GCM authentication tag for integrity & tamper detection
 * - Versioned ciphertext format: v{version}:{base64(iv)}:{base64(tag)}:{base64(ciphertext)}
 * - Key rotation support: decrypts any version, encrypts with latest version
 * - Automatic plaintext fallback for seamless migration
 */
@Injectable()
export class EncryptionService implements OnModuleInit {
  private readonly logger = new Logger(EncryptionService.name);
  private keys: Map<string, Buffer> = new Map();
  private latestVersion!: string;

  constructor(
    @Inject(encryptionConfig.KEY)
    private readonly config: ConfigType<typeof encryptionConfig>,
  ) {}

  onModuleInit() {
    this.loadKey(this.config.keyVersion, this.config.key);
    this.latestVersion = this.config.keyVersion;
    this.logger.log(
      `[DEBUG] EncryptionService initialized with key version ${this.latestVersion}. ` +
        `Keys loaded: ${Array.from(this.keys.keys()).join(', ')}`,
    );
  }

  /**
   * Derive a 32-byte key from any-length string using SHA-256.
   */
  private deriveKey(secret: string): Buffer {
    return createHash('sha256').update(secret).digest();
  }

  /**
   * Load a key version for decryption (used during key rotation).
   */
  loadKey(version: string, secret: string): void {
    if (!secret || secret.length < 8) {
      throw new Error(
        `Encryption key for version ${version} is too short (min 8 chars)`,
      );
    }
    this.keys.set(version, this.deriveKey(secret));
    this.logger.log(`[DEBUG] Loaded encryption key version ${version}`);
  }

  /**
   * Unload a key version (useful after rotation is complete).
   */
  unloadKey(version: string): void {
    this.keys.delete(version);
    this.logger.log(`[DEBUG] Unloaded encryption key version ${version}`);
  }

  /**
   * Check if a value appears to be an encrypted string.
   */
  isEncrypted(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    return /^v\d+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/.test(value);
  }

  /**
   * Encrypt a value using AES-256-GCM with the latest key version.
   * The input is JSON-stringified before encryption to preserve type information.
   *
   * Returns null/undefined unchanged.
   */
  encrypt(value: unknown): string {
    this.logger.debug(
      `[DEBUG] encrypt() called with value=${JSON.stringify(value)} ` +
        `type=${typeof value}`,
    );

    if (value === undefined || value === null) {
      this.logger.debug(`[DEBUG] encrypt() early return: value is null/undefined`);
      return value as any;
    }

    // Do not double-encrypt
    if (this.isEncrypted(value)) {
      this.logger.debug(`[DEBUG] encrypt() early return: value already encrypted`);
      return value as string;
    }

    const plaintext = JSON.stringify(value);
    const key = this.keys.get(this.latestVersion);
    if (!key) {
      throw new Error(`Encryption key version ${this.latestVersion} not found`);
    }

    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const result = [
      `v${this.latestVersion}`,
      iv.toString('base64'),
      authTag.toString('base64'),
      ciphertext.toString('base64'),
    ].join(':');

    this.logger.debug(
      `[DEBUG] encrypt() produced ciphertext=${result.substring(0, 30)}... ` +
        `(length=${result.length})`,
    );
    return result;
  }

  /**
   * Parse the encrypted payload format.
   */
  private parsePayload(encrypted: string): EncryptedPayload {
    const parts = encrypted.split(':');
    if (parts.length !== 4) {
      throw new Error('Invalid encrypted format');
    }
    return {
      version: parts[0].replace('v', ''),
      iv: parts[1],
      authTag: parts[2],
      ciphertext: parts[3],
    };
  }

  /**
   * Decrypt a value using the version-specific key.
   * The output is JSON-parsed to restore the original type.
   *
   * If the value is not encrypted, attempts JSON parse fallback for migration.
   */
  decrypt<T = unknown>(encrypted: string | number): T {
    this.logger.debug(
      `[DEBUG] decrypt() called with value=${JSON.stringify(encrypted)} ` +
        `type=${typeof encrypted}`,
    );

    if (!encrypted || typeof encrypted !== 'string') {
      this.logger.debug(
        `[DEBUG] decrypt() early return: not a string, returning as-is`,
      );
      return encrypted as unknown as T;
    }

    if (!this.isEncrypted(encrypted)) {
      // Plaintext migration fallback
      try {
        const parsed = JSON.parse(encrypted) as T;
        this.logger.debug(
          `[DEBUG] decrypt() plaintext fallback: JSON.parse returned ${JSON.stringify(parsed)}`,
        );
        return parsed;
      } catch {
        this.logger.debug(
          `[DEBUG] decrypt() plaintext fallback: not valid JSON, returning as-is`,
        );
        return encrypted as unknown as T;
      }
    }

    const payload = this.parsePayload(encrypted);
    const key = this.keys.get(payload.version);
    if (!key) {
      throw new Error(
        `Decryption key version ${payload.version} not found. ` +
          `Available versions: ${Array.from(this.keys.keys()).join(', ')}`,
      );
    }

    const iv = Buffer.from(payload.iv, 'base64');
    const authTag = Buffer.from(payload.authTag, 'base64');
    const ciphertext = Buffer.from(payload.ciphertext, 'base64');

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');

    const result = JSON.parse(plaintext) as T;
    this.logger.debug(
      `[DEBUG] decrypt() produced ${JSON.stringify(result)} ` +
        `type=${typeof result}`,
    );
    return result;
  }

  /**
   * Set the latest key version for future encryptions.
   * Call this after loading the new key version with loadKey().
   */
  setLatestVersion(version: string): void {
    if (!this.keys.has(version)) {
      throw new Error(`Key version ${version} not loaded`);
    }
    this.latestVersion = version;
    this.logger.log(`Latest encryption key version set to ${version}`);
  }

  getLatestVersion(): string {
    return this.latestVersion;
  }

  /**
   * Re-encrypt a value with the latest key version.
   * Useful for background key rotation jobs.
   */
  rotateEncryption<T>(encrypted: string | number): string {
    const plaintext = this.decrypt<T>(encrypted);
    return this.encrypt(plaintext);
  }

  /**
   * Returns true if the given field value needs rotation
   * (i.e., it was encrypted with an older key version).
   */
  needsRotation(encrypted: string | number): boolean {
    if (!this.isEncrypted(encrypted)) return false;
    const payload = this.parsePayload(encrypted as string);
    return payload.version !== this.latestVersion;
  }
}
