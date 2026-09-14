import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Expired idempotency keys are already treated as absent on lookup (see
 * IdempotencyInterceptor), so this exists purely to bound table growth on a
 * free-tier database rather than for correctness.
 */
@Injectable()
export class IdempotencyCleanupService {
  private readonly logger = new Logger(IdempotencyCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async purgeExpired(): Promise<void> {
    try {
      const { count } = await this.prisma.idempotencyKey.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      if (count > 0) {
        this.logger.log(`Purged ${count} expired idempotency key(s)`);
      }
    } catch (error) {
      // A missed sweep is not urgent — expired rows are already ignored on
      // lookup — so log and try again next hour rather than crash anything.
      this.logger.warn(`Idempotency key cleanup failed: ${(error as Error).message}`);
    }
  }
}
