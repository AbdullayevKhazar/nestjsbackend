import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import encryptionConfig from '../../config/encryption.config';
import { EncryptionService } from './encryption.service';

/**
 * Global encryption module.
 *
 * Provides EncryptionService for AES-256-GCM field-level encryption.
 * Imported once in AppModule and available everywhere.
 */
@Global()
@Module({
  imports: [ConfigModule.forFeature(encryptionConfig)],
  providers: [EncryptionService],
  exports: [EncryptionService],
})
export class EncryptionModule {}
