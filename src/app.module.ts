import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { appConfig, databaseConfig, jwtConfig } from './config';

import { envValidationSchema } from './config/env.validation';
import { DatabaseModule } from './database';
import { HealthModule } from './modules/health/health.module';

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
  ],
})
export class AppModule {}
