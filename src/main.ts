import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';

/**
 * Node's default behaviour for an unhandled promise rejection (since v15) is
 * to crash the process with no application-level log line — Render then
 * restarts the container and the actual cause is never seen anywhere. These
 * log the real error before Node's own handling proceeds, so a future crash
 * is diagnosable from `render logs` instead of showing up only as a gap.
 */
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[fatal] Uncaught exception:', error);
  // The process is now in an undefined state — exit rather than limp on,
  // but only after the error above is actually on the page.
  process.exit(1);
});

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  const prefix = config.getOrThrow<string>('apiPrefix');
  const port = config.getOrThrow<number>('port');
  const corsOrigins = config.getOrThrow<string[]>('corsOrigins');
  const isProduction = config.get<string>('env') === 'production';
  const swaggerEnabled = config.getOrThrow<boolean>('swaggerEnabled');

  // Render sits in front of this app as a single reverse-proxy hop. Without
  // this, Express reads every request's IP as that one upstream hop — so
  // ThrottlerGuard buckets ALL traffic (every real client, plus the
  // platform's own health-check probe) together as if it were one caller,
  // instead of correctly limiting each real client individually. Trusting
  // exactly 1 hop (not `true`, which would trust an unbounded chain and let a
  // client spoof its own IP via X-Forwarded-For) matches Render's topology.
  app.set('trust proxy', 1);

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
