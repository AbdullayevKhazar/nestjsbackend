import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { setupSwagger } from './config/swagger.config';

import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());

  const nodeEnv = configService.get<string>('NODE_ENV') ?? 'development';
  const isProduction = nodeEnv === 'production';
  const frontendUrl = configService.get<string>('FRONTEND_URL');
  const allowedOrigins = [
    frontendUrl,
    nodeEnv !== 'production' ? 'http://localhost:3000' : undefined,
  ].filter((origin): origin is string => Boolean(origin));

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  app.setGlobalPrefix(configService.get<string>('API_PREFIX') || 'api/v1');

  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  if (!isProduction) {
    setupSwagger(app);
  }

  const port = configService.get<number>('PORT') ?? 5000;
  await app.listen(port);

  logger.log(
    `Server running on port ${port} in ${nodeEnv} mode. Frontend origin: ${frontendUrl ?? 'not set'}`,
  );
}

void bootstrap();
