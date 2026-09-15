/**
 * Writes the OpenAPI spec to openapi/ so the frontend can read the contract,
 * generate a typed client, or import it into Postman without running the API.
 *
 * Run with: npm run openapi
 *
 * No database is needed — PrismaService is stubbed out, because this only
 * inspects route metadata.
 */
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { addIdempotencyKeyHeader } from '../src/common/openapi/add-idempotency-header';
import { Test } from '@nestjs/testing';
import * as yaml from 'js-yaml';
import { mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

// Env validation runs on boot; these placeholders keep it happy without a .env.
process.env.DATABASE_URL ||= 'postgresql://placeholder:placeholder@localhost:5432/placeholder';
process.env.JWT_ACCESS_SECRET ||= 'placeholder-secret-for-openapi-generation-only';
process.env.JWT_REFRESH_SECRET ||= 'placeholder-secret-for-openapi-generation-only';
// Forced, not defaulted: a developer's .env with MEDIA_DRIVER=s3 would
// otherwise demand real storage credentials just to describe the routes.
// Where images are stored does not change the API contract.
process.env.MEDIA_DRIVER = 'local';

async function generate() {
  const { AppModule } = await import('../src/app.module');
  const { PrismaService } = await import('../src/prisma/prisma.service');

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue({ $connect: async () => undefined, $disconnect: async () => undefined })
    .compile();

  const app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix(process.env.API_PREFIX ?? 'api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();

  const config = new DocumentBuilder()
    .setTitle('FindMyStuff API')
    .setDescription(
      [
        'Remember where you kept your stuff.',
        '',
        'Hierarchy: **Place** (home/office/locker) → **Storage** tree (room → almirah → shelf → box) → **Item**.',
        '',
        'Every place-scoped route is nested under `/places/{placeId}` and is checked against your',
        'membership of that place. Asking for a place you are not a member of returns **404**, not 403 —',
        'the API never confirms that someone else\'s data exists.',
        '',
        'All routes except signup, login, refresh, logout and health require',
        '`Authorization: Bearer <accessToken>`.',
      ].join('\n'),
    )
    .setVersion(process.env.npm_package_version ?? '0.1.0')
    // The name must be 'bearer' to match the bare @ApiBearerAuth() decorators
    // on the controllers, otherwise Swagger UI's Authorize button applies to
    // nothing.
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
    .addServer('http://localhost:3000', 'Local development')
    .addTag('auth', 'Signup, login, tokens and terms acceptance')
    .addTag('users', 'Your profile and looking people up')
    .addTag('friends', 'Friend requests — the step before sharing a place')
    .addTag('places', 'Houses, offices, lockers')
    .addTag('members', 'Who can see a place, and invite codes')
    .addTag('storages', 'The nested storage tree')
    .addTag('items', 'The things you keep')
    .addTag('search', 'Find where you kept something')
    .addTag('sync', 'Delta sync for offline backup — see FRONTEND.md')
    .addTag('media', 'Photo upload and serving')
    .addTag('health', 'Liveness')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  addIdempotencyKeyHeader(document);

  const outDir = path.resolve(__dirname, '..', 'openapi');
  mkdirSync(outDir, { recursive: true });

  writeFileSync(path.join(outDir, 'openapi.json'), `${JSON.stringify(document, null, 2)}\n`);
  writeFileSync(
    path.join(outDir, 'openapi.yaml'),
    yaml.dump(document, { noRefs: true, lineWidth: 100 }),
  );

  await app.close();

  const pathCount = Object.keys(document.paths).length;
  const opCount = Object.values(document.paths).reduce(
    (total, item) => total + Object.keys(item as object).length,
    0,
  );
  const schemaCount = Object.keys(document.components?.schemas ?? {}).length;

  console.log(`OpenAPI written to openapi/`);
  console.log(`  ${pathCount} paths, ${opCount} operations, ${schemaCount} schemas`);
}

generate().catch((error) => {
  console.error(error);
  process.exit(1);
});
