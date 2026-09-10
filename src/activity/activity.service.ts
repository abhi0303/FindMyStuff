import { Injectable, Logger } from '@nestjs/common';
import { ActivityAction, Prisma } from '@prisma/client';
import { PaginationDto, paginate } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';

interface LogInput {
  placeId: string;
  actorId: string;
  action: ActivityAction;
  entityType: string;
  entityId?: string | null;
  summary: string;
  meta?: Prisma.InputJsonValue;
}

@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fire-and-forget: an audit write must never fail the user's actual action.
   * Accepts an optional transaction client so it can join a surrounding
   * transaction when the caller has one.
   */
  async log(input: LogInput, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    try {
      await client.activityLog.create({
        data: {
          placeId: input.placeId,
          actorId: input.actorId,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId ?? null,
          summary: input.summary,
          meta: input.meta,
        },
      });
    } catch (error) {
      this.logger.warn(`Failed to write activity log: ${(error as Error).message}`);
    }
  }

  async listForPlace(placeId: string, pagination: PaginationDto) {
    const [data, total] = await this.prisma.$transaction([
      this.prisma.activityLog.findMany({
        where: { placeId },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.limit,
        include: { actor: { select: { id: true, name: true, avatarMediaId: true } } },
      }),
      this.prisma.activityLog.count({ where: { placeId } }),
    ]);

    return paginate(data, total, pagination.page, pagination.limit);
  }
}
