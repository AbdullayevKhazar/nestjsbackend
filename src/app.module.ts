import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { appConfig, databaseConfig, jwtConfig, encryptionConfig } from './config';

import { envValidationSchema } from './config/env.validation';
import { DatabaseModule } from './database';
import { HealthModule } from './modules/health/health.module';
import { UserModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { CustomersModule } from './modules/customers/customers.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { ReportsModule } from './modules/reports/reports.module';
import { PublicModule } from './modules/public/public.module';
import { BackupModule } from './modules/backup/backup.module';
import { EncryptionModule } from './modules/encryption/encryption.module';
import { FinancialEventsModule } from './modules/events/financial-events.module';
import { MigrationModule } from './modules/migration/migration.module';
import { RemindersModule } from './modules/reminders/reminders.module';
import { WebAuthnModule } from './modules/auth/webauthn/webauthn.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      cache: true,
      expandVariables: true,
      load: [appConfig, databaseConfig, jwtConfig, encryptionConfig],
      validationSchema: envValidationSchema,
    }),

    DatabaseModule,
    HealthModule,
    AuthModule,
    UserModule,
    CustomersModule,
    TransactionsModule,
    ReportsModule,
    PublicModule,
    BackupModule,
    EncryptionModule,
    FinancialEventsModule,
    MigrationModule,
    RemindersModule,
    WebAuthnModule,
  ],
})
export class AppModule {}
