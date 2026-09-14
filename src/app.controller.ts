import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from './common/decorators/public.decorator';
import { PrismaService } from './prisma/prisma.service';

export class HealthResponse {
  @ApiProperty({ enum: ['ok', 'degraded'], example: 'ok' })
  status!: string;

  @ApiProperty({ enum: ['up', 'down'], example: 'up' })
  database!: string;

  @ApiProperty({ format: 'date-time' })
  timestamp!: string;
}

/** Below this, a slow database is reported as "down" rather than hanging the response. */
const DB_CHECK_TIMEOUT_MS = 2500;

@ApiTags('health')
@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  // @Public() only bypasses JWT auth — it does nothing for ThrottlerGuard,
  // which is a separate global guard. Without this, the platform's own
  // health-check probe shares a rate-limit bucket with real traffic, and once
  // that bucket fills, the health check itself starts getting 429'd — which
  // the platform reads as "unhealthy" and restarts the instance over.
  //
  // Bare @SkipThrottle() only skips the bucket named 'default' — it does NOT
  // skip every configured throttler. This app registers two named throttlers
  // ('default' and the much tighter 'auth', 10 req/5min), and both apply to
  // every route unless skipped by name. Naming both here is required, not
  // redundant — the 'auth' bucket alone is tight enough to 429 a health
  // check within seconds of restart-loop-induced retries.
  @SkipThrottle({ default: true, auth: true })
  @Get('health')
  @ApiOperation({ summary: 'Liveness and database check' })
  @ApiOkResponse({ type: HealthResponse })
  async health() {
    let database = 'up';
    try {
      // A liveness check must answer "is the HTTP server responsive" — it
      // must never block on a slow downstream dependency. Neon (or any
      // scale-to-zero database) can take several seconds to wake, and
      // without a bound here that wait becomes the response time. If it
      // exceeds the platform's own health-check timeout, the platform
      // concludes the *server* is frozen and restarts the container —
      // right as the database was about to come back, turning one slow
      // wake-up into a repeating restart loop.
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_resolve, reject) =>
          setTimeout(() => reject(new Error('db check timed out')), DB_CHECK_TIMEOUT_MS),
        ),
      ]);
    } catch {
      database = 'down';
    }

    // Always 200: this endpoint reports the server is alive, which it is
    // regardless of database state. "degraded" in the body is the signal
    // for a human or a dashboard, not a reason to fail the platform's check.
    return {
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      timestamp: new Date().toISOString(),
    };
  }
}
