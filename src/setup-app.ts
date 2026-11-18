import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
export function setupApp(app: INestApplication) {
  app.useGlobalFilters(new PrismaExceptionFilter());
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const origins = (
    app.get(ConfigService).get<string>('CART_ALLOWED_ORIGINS') ?? ''
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins.length)
    app.enableCors({
      origin: origins,
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Cart-Request'],
    });
  app.enableShutdownHooks();
}
