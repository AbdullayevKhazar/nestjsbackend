import { ValidationPipe } from '@nestjs/common';
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

  app.use(helmet());

  app.use(compression());

  app.use(cookieParser());

  app.enableCors({
    origin: true,
    credentials: true,
  });

  app.setGlobalPrefix(process.env.API_PREFIX || 'api/v1');

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
  setupSwagger(app);
  await app.listen(process.env.PORT ?? 5000);

  console.log(`🚀 Server running on port ${process.env.PORT}`);
}

void bootstrap();
