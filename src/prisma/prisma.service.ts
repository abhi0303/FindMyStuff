import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

const CONNECT_ATTEMPTS = 5;
const BASE_DELAY_MS = 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log:
        process.env.NODE_ENV === 'development'
          ? [{ emit: 'event', level: 'query' }, 'warn', 'error']
          : ['warn', 'error'],
    });
  }

  /**
   * Retries the initial connection with backoff, and lets the app start even if
   * every attempt fails.
   *
   * A scale-to-zero database (Neon's free tier suspends after ~5 minutes idle)
   * is briefly unreachable while it wakes. Treating that as fatal would exit the
   * process, and the platform would serve 502s until someone redeployed by hand.
   * Prisma connects lazily on first query anyway, so a failed pre-connect costs
   * only a slower first request, not correctness.
   */
  async onModuleInit() {
    for (let attempt = 1; attempt <= CONNECT_ATTEMPTS; attempt += 1) {
      try {
        await this.$connect();
        this.logger.log(`Connected to database (attempt ${attempt})`);
        return;
      } catch (error) {
        const message = (error as Error).message;

        if (attempt === CONNECT_ATTEMPTS) {
          this.logger.error(
            `Could not reach the database after ${CONNECT_ATTEMPTS} attempts: ${message}. ` +
              'Starting anyway; queries will reconnect on demand.',
          );
          return;
        }

        const delay = BASE_DELAY_MS * 2 ** (attempt - 1);
        this.logger.warn(
          `Database not reachable (attempt ${attempt}/${CONNECT_ATTEMPTS}): ${message}. ` +
            `Retrying in ${delay}ms`,
        );
        await sleep(delay);
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
