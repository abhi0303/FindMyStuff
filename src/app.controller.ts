import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
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
