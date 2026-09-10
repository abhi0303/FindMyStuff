import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  const prefix = config.getOrThrow<string>('apiPrefix');
  const port = config.getOrThrow<number>('port');
  const corsOrigins = config.getOrThrow<string[]>('corsOrigins');
  const isProduction = config.get<string>('env') === 'production';
  const swaggerEnabled = config.getOrThrow<boolean>('swaggerEnabled');

  app.setGlobalPrefix(prefix);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(compression());

  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // Unknown fields are rejected rather than ignored, so a typo in a client
      // payload surfaces immediately instead of silently doing nothing.
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // Base64 images arrive in the JSON body, so the default 100kb limit is far
  // too small. Per-image size is still enforced in MediaService.
  app.useBodyParser('json', { limit: '25mb' });
  app.useBodyParser('urlencoded', { limit: '25mb', extended: true });

  app.enableShutdownHooks();

  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('FindMyStuff API')
      .setDescription('Remember where you kept your stuff.')
      .setVersion('0.1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(`${prefix}/docs`, app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  // Must bind 0.0.0.0, not localhost, or a container platform cannot route to it.
  await app.listen(port, '0.0.0.0');

  logger.log(`FindMyStuff API listening on port ${port} (prefix /${prefix})`);
  if (swaggerEnabled) {
    logger.log(`API docs at /${prefix}/docs`);
  }
  if (isProduction && corsOrigins.length === 0) {
    logger.warn('CORS_ORIGINS is empty in production — every origin is currently allowed');
  }
}

void bootstrap();
