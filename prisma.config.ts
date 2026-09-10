import * as path from 'node:path';
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Prisma config files do not auto-load .env, hence the dotenv import above.
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    seed: 'ts-node prisma/seed.ts',
  },
});
