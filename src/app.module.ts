import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { appConfig, databaseConfig, jwtConfig } from './config';

import { envValidationSchema } from './config/env.validation';
import { DatabaseModule } from './database';
import { HealthModule } from './modules/health/health.module';
import { UserModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      load: [appConfig, databaseConfig, jwtConfig],
      validationSchema: envValidationSchema,
    }),

    DatabaseModule,
    HealthModule,
    UserModule,
  ],
})
export class AppModule {}
