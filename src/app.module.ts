import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { appConfig, databaseConfig, jwtConfig } from './config';

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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      cache: true,
      expandVariables: true,
      load: [appConfig, databaseConfig, jwtConfig],
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
  ],
})
export class AppModule {}
