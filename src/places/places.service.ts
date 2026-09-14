import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityAction, MemberRole, MemberStatus, Prisma } from '@prisma/client';
import { visibilityFilter } from '../common/utils/visibility.util';
import { ActivityService } from '../activity/activity.service';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlaceDto } from './dto/create-place.dto';
import { UpdatePlaceDto } from './dto/update-place.dto';

@Injectable()
export class PlacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly activity: ActivityService,
  ) {}

  async create(userId: string, dto: CreatePlaceDto) {
    const { coverImageBase64, ...data } = dto;
    const coverMediaId = await this.media.createOptional(userId, coverImageBase64);

    const place = await this.prisma.$transaction(async (tx) => {
      const created = await tx.place.create({
        data: {
          // dto.id (optional, client-generated for offline creates) flows
          // through via ...data — do not destructure it out separately.
          ...data,
          coverMediaId,
          ownerId: userId,
          // The creator is seeded as an ACTIVE OWNER member, so every
          // permission check goes through the same membership table with no
          // special case for the owner.
          members: {
            create: {
              userId,
              role: MemberRole.OWNER,
              status: MemberStatus.ACTIVE,
              joinedAt: new Date(),
            },
          },
        },
      });

      await this.activity.log(
        {
          placeId: created.id,
          actorId: userId,
          action: ActivityAction.PLACE_CREATED,
          entityType: 'Place',
          entityId: created.id,
          summary: `Created ${created.name}`,
        },
        tx,
      );

      return created;
    });

    return place;
  }

  /** Every place the user is an active member of — owned or shared with them. */
  async findAllForUser(userId: string) {
    const places = await this.prisma.place.findMany({
      where: {
        deletedAt: null,
        members: { some: { userId, status: MemberStatus.ACTIVE } },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        members: {
          where: { status: MemberStatus.ACTIVE },
          select: {
            role: true,
            userId: true,
            user: { select: { id: true, name: true, avatarMediaId: true } },
          },
        },
        _count: { select: { storages: true } },
      },
    });

    // Item counts must respect PRIVATE visibility, so they cannot come from
    // Prisma's _count (which has no per-row filter here).
    const counts = await this.prisma.item.groupBy({
      by: ['placeId'],
      where: {
        deletedAt: null,
        placeId: { in: places.map((place) => place.id) },
        ...visibilityFilter(userId),
      },
      _count: { _all: true },
    });

    const countByPlace = new Map(counts.map((row) => [row.placeId, row._count._all]));

    return places.map(({ members, _count, ...place }) => ({
      ...place,
      myRole: members.find((member) => member.userId === userId)?.role ?? MemberRole.VIEWER,
      memberCount: members.length,
      members: members.map((member) => ({ ...member.user, role: member.role })),
      storageCount: _count.storages,
      itemCount: countByPlace.get(place.id) ?? 0,
    }));
  }

  async findOne(userId: string, placeId: string) {
    const place = await this.prisma.place.findFirst({
      where: {
        id: placeId,
        deletedAt: null,
        members: { some: { userId, status: MemberStatus.ACTIVE } },
      },
      include: {
        owner: { select: { id: true, name: true, email: true, avatarMediaId: true } },
        members: {
          where: { status: { not: MemberStatus.REMOVED } },
          select: {
            id: true,
            role: true,
            status: true,
            joinedAt: true,
            user: { select: { id: true, name: true, email: true, avatarMediaId: true } },
          },
        },
      },
    });

    if (!place) throw new NotFoundException('Place not found');

    const [storageCount, itemCount] = await Promise.all([
      this.prisma.storage.count({ where: { placeId, deletedAt: null } }),
      this.prisma.item.count({
        where: { placeId, deletedAt: null, ...visibilityFilter(userId) },
      }),
    ]);

    return {
      ...place,
      myRole: place.members.find((member) => member.user.id === userId)?.role,
      storageCount,
      itemCount,
    };
  }

  async update(userId: string, placeId: string, dto: UpdatePlaceDto) {
    const { coverImageBase64, ...data } = dto;
    const coverMediaId = await this.media.createOptional(userId, coverImageBase64);

    const place = await this.prisma.place.update({
      where: { id: placeId },
      data: { ...data, ...(coverMediaId ? { coverMediaId } : {}) },
    });

    await this.activity.log({
      placeId,
      actorId: userId,
      action: ActivityAction.PLACE_UPDATED,
      entityType: 'Place',
      entityId: placeId,
      summary: `Updated ${place.name}`,
      meta: Object.keys(data) as Prisma.InputJsonValue,
    });

    return place;
  }

  /**
   * Soft-deletes a place and everything under it. Only the owner may do this —
   * an ADMIN can manage contents but cannot destroy the place.
   */
  async remove(userId: string, placeId: string) {
    const place = await this.prisma.place.findFirst({
      where: { id: placeId, deletedAt: null },
      select: { id: true, ownerId: true, name: true },
    });

    if (!place) throw new NotFoundException('Place not found');
    if (place.ownerId !== userId) {
      throw new ForbiddenException('Only the owner can delete this place');
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.item.updateMany({
        where: { placeId, deletedAt: null },
        data: { deletedAt: now },
      }),
      this.prisma.storage.updateMany({
        where: { placeId, deletedAt: null },
        data: { deletedAt: now },
      }),
      this.prisma.place.update({ where: { id: placeId }, data: { deletedAt: now } }),
    ]);

    return { success: true, message: `${place.name} deleted` };
  }
}
