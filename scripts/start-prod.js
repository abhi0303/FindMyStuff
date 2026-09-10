/**
 * Production entrypoint.
 *
 * Applies pending migrations, then starts the server — but never lets a
 * transient database hiccup stop the server from starting.
 *
 * Why this exists: the obvious `prisma migrate deploy && node dist/main` means
 * any migration failure prevents the app from launching at all, which shows up
 * as a permanent 502. That is a real risk with a scale-to-zero database (Neon's
 * free tier suspends after ~5 minutes idle), because every wake-up begins with
 * a cold connection. On a restart there is usually nothing to migrate anyway,
 * so refusing to boot is the wrong trade.
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 2000;
const ROOT = path.resolve(__dirname, '..');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function attemptMigration() {
  const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    cwd: ROOT,
    env: process.env,
  });
  return result.status === 0;
}

async function runMigrations() {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    if (attemptMigration()) {
      console.log(`[start] migrations applied (attempt ${attempt})`);
      return true;
    }

    if (attempt < MAX_ATTEMPTS) {
      // Exponential backoff gives a suspended database time to wake up.
      const delay = BASE_DELAY_MS * 2 ** (attempt - 1);
      console.warn(`[start] migration attempt ${attempt} failed; retrying in ${delay}ms`);
      await sleep(delay);
    }
  }

  return false;
}

async function main() {
  const migrated = await runMigrations();

  if (!migrated) {
    console.error(
      `[start] migrations did not apply after ${MAX_ATTEMPTS} attempts. Starting ` +
        'the server anyway — it retries its own connection, and a restart usually ' +
        'has no pending migrations. Check DIRECT_URL if this repeats.',
    );
  }

  // Loaded in this same process, so Render's signal handling and health checks
  // behave exactly as they would running dist/main directly.
  require(path.resolve(ROOT, 'dist', 'main.js'));
}

void main();
