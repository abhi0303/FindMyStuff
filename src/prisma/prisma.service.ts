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
   * Kicks off the connection retry in the background — deliberately NOT
   * awaited.
   *
   * Nest does not call app.listen() until every module's onModuleInit has
   * resolved. Awaiting a multi-attempt retry loop here means a slow database
   * — a scale-to-zero database waking up, say — blocks the HTTP port from
   * opening at all for the full retry window (which, chained with Prisma's
   * own internal pool timeout, can be a minute or more). That is worse than
   * the problem it was meant to solve: instead of a fast response reporting
   * degraded health, nothing is listening on the port and every request
   * — including the platform's own health check — gets connection-refused.
   *
   * Prisma also connects lazily on first query, so a slow or failed
   * pre-connect costs nothing beyond a warning log; it was never required for
   * correctness.
   */
  onModuleInit() {
    void this.connectWithRetry();
  }

  private async connectWithRetry(): Promise<void> {
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
              'The server is still up; queries will reconnect on demand.',
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
