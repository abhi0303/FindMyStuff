import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MemberRole, MemberStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PLACE_ROLE_KEY } from '../decorators/place-roles.decorator';
import { AuthenticatedRequest, hasAtLeastRole } from '../types';

/**
 * The single chokepoint for place-scoped access.
 *
 * Every place-scoped route is nested under /places/:placeId, so this guard can
 * verify membership before any handler runs. A non-member gets 404 rather than
 * 403 — we do not confirm that someone else's place exists.
 */
@Injectable()
export class PlaceMemberGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const placeId = request.params?.placeId as string | undefined;

    if (!placeId) {
      throw new NotFoundException('Place not found');
    }

    const membership = await this.prisma.placeMember.findFirst({
      where: {
        placeId,
        userId: request.user.id,
        status: MemberStatus.ACTIVE,
        place: { deletedAt: null },
      },
    });

    if (!membership) {
      throw new NotFoundException('Place not found');
    }

    const minRole =
      this.reflector.getAllAndOverride<MemberRole>(PLACE_ROLE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? MemberRole.VIEWER;

    if (!hasAtLeastRole(membership.role, minRole)) {
      throw new ForbiddenException(
        `This action requires the ${minRole} role or higher in this place.`,
      );
    }

    request.placeMembership = membership;
    return true;
  }
}
