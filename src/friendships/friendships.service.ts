import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FriendshipStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFriendRequestDto } from './dto/create-friend-request.dto';

const USER_CARD = {
  id: true,
  name: true,
  email: true,
  avatarMediaId: true,
} as const;

@Injectable()
export class FriendshipsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Friendship is symmetric, so both directions have to be checked. */
  private pairWhere(a: string, b: string): Prisma.FriendshipWhereInput {
    return {
      OR: [
        { requesterId: a, addresseeId: b },
        { requesterId: b, addresseeId: a },
      ],
    };
  }

  async areFriends(a: string, b: string): Promise<boolean> {
    const found = await this.prisma.friendship.findFirst({
      where: { ...this.pairWhere(a, b), status: FriendshipStatus.ACCEPTED },
      select: { id: true },
    });
    return Boolean(found);
  }

  async sendRequest(userId: string, dto: CreateFriendRequestDto) {
    const target = await this.prisma.user.findFirst({
      where: {
        deletedAt: null,
        isActive: true,
        ...(dto.userId ? { id: dto.userId } : { email: dto.email }),
      },
      select: USER_CARD,
    });

    if (!target) throw new NotFoundException('No user found with those details');
    if (target.id === userId) throw new BadRequestException('You cannot add yourself');

    const existing = await this.prisma.friendship.findFirst({
      where: this.pairWhere(userId, target.id),
    });

    if (existing) {
      if (existing.status === FriendshipStatus.ACCEPTED) {
        throw new ConflictException(`You and ${target.name} are already connected`);
      }
      if (existing.status === FriendshipStatus.BLOCKED) {
        throw new ForbiddenException('This request cannot be sent');
      }
      if (existing.status === FriendshipStatus.PENDING) {
        // They already asked you — treat your request as the acceptance.
        if (existing.addresseeId === userId) {
          return this.respond(userId, existing.id, FriendshipStatus.ACCEPTED);
        }
        throw new ConflictException('A request is already pending');
      }

      // A previously rejected request can be re-sent.
      return this.prisma.friendship.update({
        where: { id: existing.id },
        data: {
          requesterId: userId,
          addresseeId: target.id,
          status: FriendshipStatus.PENDING,
          message: dto.message,
          respondedAt: null,
        },
        include: { requester: { select: USER_CARD }, addressee: { select: USER_CARD } },
      });
    }

    return this.prisma.friendship.create({
      data: {
        requesterId: userId,
        addresseeId: target.id,
        message: dto.message,
      },
      include: { requester: { select: USER_CARD }, addressee: { select: USER_CARD } },
    });
  }

  async respond(userId: string, friendshipId: string, status: FriendshipStatus) {
    const friendship = await this.prisma.friendship.findUnique({ where: { id: friendshipId } });

    if (!friendship || friendship.addresseeId !== userId) {
      throw new NotFoundException('Friend request not found');
    }
    if (friendship.status !== FriendshipStatus.PENDING) {
      throw new BadRequestException('This request has already been answered');
    }

    return this.prisma.friendship.update({
      where: { id: friendshipId },
      data: { status, respondedAt: new Date() },
      include: { requester: { select: USER_CARD }, addressee: { select: USER_CARD } },
    });
  }

  async listFriends(userId: string) {
    const rows = await this.prisma.friendship.findMany({
      where: {
        status: FriendshipStatus.ACCEPTED,
        OR: [{ requesterId: userId }, { addresseeId: userId }],
      },
      include: { requester: { select: USER_CARD }, addressee: { select: USER_CARD } },
      orderBy: { updatedAt: 'desc' },
    });

    return rows.map((row) => ({
      friendshipId: row.id,
      since: row.respondedAt,
      user: row.requesterId === userId ? row.addressee : row.requester,
    }));
  }

  async listRequests(userId: string, direction: 'incoming' | 'outgoing') {
    const where: Prisma.FriendshipWhereInput =
      direction === 'incoming'
        ? { addresseeId: userId, status: FriendshipStatus.PENDING }
        : { requesterId: userId, status: FriendshipStatus.PENDING };

    return this.prisma.friendship.findMany({
      where,
      include: { requester: { select: USER_CARD }, addressee: { select: USER_CARD } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Removing a friend deliberately does not remove them from shared places —
   * that is a separate, explicit action so nobody silently loses access.
   */
  async remove(userId: string, otherUserId: string) {
    const result = await this.prisma.friendship.deleteMany({
      where: { ...this.pairWhere(userId, otherUserId), status: FriendshipStatus.ACCEPTED },
    });

    if (result.count === 0) throw new NotFoundException('You are not connected to this user');
    return { success: true };
  }

  async block(userId: string, otherUserId: string) {
    if (userId === otherUserId) throw new BadRequestException('You cannot block yourself');

    const existing = await this.prisma.friendship.findFirst({
      where: this.pairWhere(userId, otherUserId),
    });

    if (existing) {
      return this.prisma.friendship.update({
        where: { id: existing.id },
        data: {
          status: FriendshipStatus.BLOCKED,
          requesterId: userId,
          addresseeId: otherUserId,
          respondedAt: new Date(),
        },
      });
    }

    return this.prisma.friendship.create({
      data: {
        requesterId: userId,
        addresseeId: otherUserId,
        status: FriendshipStatus.BLOCKED,
        respondedAt: new Date(),
      },
    });
  }
}
