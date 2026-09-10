import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivityAction,
  Item,
  ItemStatus,
  MemberRole,
  Prisma,
  Storage,
  Visibility,
} from '@prisma/client';
import { paginate } from '../common/dto/pagination.dto';
import { hasAtLeastRole } from '../common/types';
import { visibilityFilter } from '../common/utils/visibility.util';
import { ActivityService } from '../activity/activity.service';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';
import { StoragesService } from '../storages/storages.service';
import { CreateItemDto } from './dto/create-item.dto';
import { LendItemDto } from './dto/lend-item.dto';
import { MoveItemDto } from './dto/move-item.dto';
import { QueryItemDto } from './dto/query-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';

@Injectable()
export class ItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly storages: StoragesService,
    private readonly activity: ActivityService,
  ) {}

  private async requireStorageInPlace(placeId: string, storageId: string): Promise<Storage> {
    const storage = await this.prisma.storage.findFirst({
      where: { id: storageId, placeId, deletedAt: null },
    });

    if (!storage) throw new NotFoundException('Storage not found in this place');
    return storage;
  }

  /**
   * A PRIVATE item is invisible to everyone but its owner, so a miss here is
   * reported as "not found" rather than "forbidden".
   */
  private async requireItem(userId: string, placeId: string, itemId: string): Promise<Item> {
    const item = await this.prisma.item.findFirst({
      where: { id: itemId, placeId, deletedAt: null, ...visibilityFilter(userId) },
    });

    if (!item) throw new NotFoundException('Item not found');
    return item;
  }

  /** VIEWERs cannot write; a private item can only be written by its owner. */
  private assertCanWrite(item: Item, userId: string, role: MemberRole) {
    if (!hasAtLeastRole(role, MemberRole.MEMBER)) {
      throw new ForbiddenException('This action requires the MEMBER role or higher in this place.');
    }
    if (item.visibility === Visibility.PRIVATE && item.ownerId !== userId) {
      throw new NotFoundException('Item not found');
    }
  }

  async create(userId: string, placeId: string, dto: CreateItemDto) {
    const { imagesBase64, storageId, ...data } = dto;

    const storage = storageId ? await this.requireStorageInPlace(placeId, storageId) : null;
    const mediaIds = await this.uploadImages(userId, imagesBase64);
    const label = storage ? await this.storages.breadcrumb(storage) : null;

    const item = await this.prisma.$transaction(async (tx) => {
      const created = await tx.item.create({
        data: {
          ...data,
          placeId,
          storageId,
          ownerId: userId,
          createdById: userId,
          media: {
            create: mediaIds.map((mediaId, index) => ({ mediaId, sortOrder: index })),
          },
        },
      });

      // The first movement records where the thing started out, so history is
      // complete from the moment it was added.
      await tx.itemMovement.create({
        data: {
          itemId: created.id,
          fromStorageId: null,
          toStorageId: storageId ?? null,
          toLabel: label,
          movedById: userId,
          note: 'Added',
        },
      });

      return created;
    });

    await this.activity.log({
      placeId,
      actorId: userId,
      action: ActivityAction.ITEM_CREATED,
      entityType: 'Item',
      entityId: item.id,
      summary: label ? `Added "${item.name}" to ${label}` : `Added "${item.name}"`,
    });

    return this.findOne(userId, placeId, item.id);
  }

  private async uploadImages(userId: string, imagesBase64?: string[]): Promise<string[]> {
    if (!imagesBase64?.length) return [];
    const uploaded = await Promise.all(
      imagesBase64.map((base64) => this.media.createFromBase64(userId, base64)),
    );
    return uploaded.map((media) => media.id);
  }

  async findAll(userId: string, placeId: string, query: QueryItemDto) {
    const where = await this.buildWhere(userId, placeId, query);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.item.findMany({
        where,
        orderBy: { [query.sortBy ?? 'updatedAt']: query.sortOrder ?? 'desc' },
        skip: query.skip,
        take: query.limit,
        include: {
          storage: { select: { id: true, name: true, type: true, path: true } },
          media: { select: { mediaId: true }, orderBy: { sortOrder: 'asc' } },
        },
      }),
      this.prisma.item.count({ where }),
    ]);

    const data = await Promise.all(
      rows.map(async ({ storage, media, ...item }) => ({
        ...item,
        storage: storage
          ? { ...storage, breadcrumb: await this.storages.breadcrumb(storage) }
          : null,
        mediaIds: media.map((entry) => entry.mediaId),
      })),
    );

    return paginate(data, total, query.page, query.limit);
  }

  private async buildWhere(
    userId: string,
    placeId: string,
    query: QueryItemDto,
  ): Promise<Prisma.ItemWhereInput> {
    // Visibility lives in AND rather than being spread onto the root, because a
    // text search needs the root OR for itself.
    const and: Prisma.ItemWhereInput[] = [visibilityFilter(userId)];

    const where: Prisma.ItemWhereInput = {
      placeId,
      deletedAt: null,
      AND: and,
      ...(query.status ? { status: query.status } : {}),
      ...(query.visibility ? { visibility: query.visibility } : {}),
      ...(query.category ? { category: { equals: query.category, mode: 'insensitive' } } : {}),
      ...(query.tag ? { tags: { has: query.tag.toLowerCase() } } : {}),
    };

    if (query.q) {
      const term = query.q.trim();
      and.push({
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { description: { contains: term, mode: 'insensitive' } },
          { aliases: { has: term.toLowerCase() } },
          { tags: { has: term.toLowerCase() } },
        ],
      });
    }

    if (query.storageId) {
      const storage = await this.requireStorageInPlace(placeId, query.storageId);

      if (query.includeNested === false) {
        where.storageId = query.storageId;
      } else {
        // Asking for "Bedroom" should also return what is inside the almirah
        // that is inside the bedroom.
        const prefix = storage.path ? `${storage.path}/${storage.id}` : storage.id;
        const descendants = await this.prisma.storage.findMany({
          where: {
            placeId,
            deletedAt: null,
            OR: [{ path: prefix }, { path: { startsWith: `${prefix}/` } }],
          },
          select: { id: true },
        });
        where.storageId = { in: [storage.id, ...descendants.map((row) => row.id)] };
      }
    }

    if (query.expiringInDays !== undefined) {
      const until = new Date();
      until.setDate(until.getDate() + query.expiringInDays);
      where.expiresAt = { not: null, lte: until };
    }

    if (query.lowStock) {
      // Prisma cannot compare two columns, so low stock is resolved to ids first.
      const lowStockIds = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "items"
        WHERE "placeId" = ${placeId}::uuid
          AND "deletedAt" IS NULL
          AND "lowStockAt" IS NOT NULL
          AND "quantity" <= "lowStockAt"
      `;
      where.id = { in: lowStockIds.map((row) => row.id) };
    }

    return where;
  }

  async findOne(userId: string, placeId: string, itemId: string) {
    const item = await this.prisma.item.findFirst({
      where: { id: itemId, placeId, deletedAt: null, ...visibilityFilter(userId) },
      include: {
        storage: true,
        owner: { select: { id: true, name: true, avatarMediaId: true } },
        createdBy: { select: { id: true, name: true, avatarMediaId: true } },
        media: { select: { mediaId: true, sortOrder: true }, orderBy: { sortOrder: 'asc' } },
        movements: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { movedBy: { select: { id: true, name: true } } },
        },
      },
    });

    if (!item) throw new NotFoundException('Item not found');

    const { storage, media, ...rest } = item;

    return {
      ...rest,
      storage: storage ? { ...storage, breadcrumb: await this.storages.breadcrumb(storage) } : null,
      mediaIds: media.map((entry) => entry.mediaId),
    };
  }

  async update(
    userId: string,
    placeId: string,
    itemId: string,
    role: MemberRole,
    dto: UpdateItemDto,
  ) {
    const item = await this.requireItem(userId, placeId, itemId);
    this.assertCanWrite(item, userId, role);

    const { imagesBase64, storageId, visibility, ...data } = dto;

    if (visibility && visibility !== item.visibility && item.ownerId !== userId) {
      throw new ForbiddenException('Only the owner of an item can change its visibility');
    }

    const mediaIds = await this.uploadImages(userId, imagesBase64);
    const isMove = storageId !== undefined && storageId !== item.storageId;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (isMove) {
        await this.recordMove(tx, item, storageId, placeId, userId, 'Updated');
      }

      if (mediaIds.length > 0) {
        const existing = await tx.itemMedia.count({ where: { itemId } });
        await tx.itemMedia.createMany({
          data: mediaIds.map((mediaId, index) => ({
            itemId,
            mediaId,
            sortOrder: existing + index,
          })),
          skipDuplicates: true,
        });
      }

      return tx.item.update({
        where: { id: itemId },
        data: {
          ...data,
          ...(visibility ? { visibility } : {}),
          ...(storageId !== undefined ? { storageId } : {}),
        },
      });
    });

    await this.activity.log({
      placeId,
      actorId: userId,
      action: isMove ? ActivityAction.ITEM_MOVED : ActivityAction.ITEM_UPDATED,
      entityType: 'Item',
      entityId: itemId,
      summary: `Updated "${updated.name}"`,
    });

    return this.findOne(userId, placeId, itemId);
  }

  /** The "I moved it" action — the single most common edit after creation. */
  async move(userId: string, placeId: string, itemId: string, role: MemberRole, dto: MoveItemDto) {
    const item = await this.requireItem(userId, placeId, itemId);
    this.assertCanWrite(item, userId, role);

    if (dto.toStorageId === item.storageId) {
      throw new BadRequestException('The item is already in that storage');
    }

    const { toLabel } = await this.prisma.$transaction(async (tx) =>
      this.recordMove(tx, item, dto.toStorageId, placeId, userId, dto.note),
    );

    await this.activity.log({
      placeId,
      actorId: userId,
      action: ActivityAction.ITEM_MOVED,
      entityType: 'Item',
      entityId: itemId,
      summary: toLabel
        ? `Moved "${item.name}" to ${toLabel}`
        : `Took "${item.name}" out of storage`,
    });

    return this.findOne(userId, placeId, itemId);
  }

  /**
   * Writes the movement row and updates the item. Breadcrumbs are snapshotted
   * so history stays readable after a storage is renamed or deleted.
   */
  private async recordMove(
    tx: Prisma.TransactionClient,
    item: Item,
    toStorageId: string | null,
    placeId: string,
    userId: string,
    note?: string,
  ) {
    let toLabel: string | null = null;

    if (toStorageId) {
      const target = await tx.storage.findFirst({
        where: { id: toStorageId, placeId, deletedAt: null },
      });
      if (!target) throw new NotFoundException('Storage not found in this place');
      toLabel = await this.storages.breadcrumb(target);
    }

    let fromLabel: string | null = null;
    if (item.storageId) {
      const current = await tx.storage.findUnique({ where: { id: item.storageId } });
      if (current) fromLabel = await this.storages.breadcrumb(current);
    }

    await tx.itemMovement.create({
      data: {
        itemId: item.id,
        fromStorageId: item.storageId,
        toStorageId,
        fromLabel,
        toLabel,
        movedById: userId,
        note,
      },
    });

    await tx.item.update({ where: { id: item.id }, data: { storageId: toStorageId } });

    return { fromLabel, toLabel };
  }

  async history(userId: string, placeId: string, itemId: string) {
    await this.requireItem(userId, placeId, itemId);

    return this.prisma.itemMovement.findMany({
      where: { itemId },
      orderBy: { createdAt: 'desc' },
      include: { movedBy: { select: { id: true, name: true, avatarMediaId: true } } },
    });
  }

  async lend(userId: string, placeId: string, itemId: string, role: MemberRole, dto: LendItemDto) {
    const item = await this.requireItem(userId, placeId, itemId);
    this.assertCanWrite(item, userId, role);

    if (item.status === ItemStatus.LENT_OUT) {
      throw new BadRequestException(`"${item.name}" is already lent to ${item.lentToName}`);
    }

    const updated = await this.prisma.item.update({
      where: { id: itemId },
      data: {
        status: ItemStatus.LENT_OUT,
        lentToName: dto.lentToName,
        lentToId: dto.lentToId,
        lentAt: new Date(),
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
      },
    });

    await this.activity.log({
      placeId,
      actorId: userId,
      action: ActivityAction.ITEM_LENT,
      entityType: 'Item',
      entityId: itemId,
      summary: `Lent "${updated.name}" to ${dto.lentToName}`,
    });

    return updated;
  }

  async returnItem(userId: string, placeId: string, itemId: string, role: MemberRole) {
    const item = await this.requireItem(userId, placeId, itemId);
    this.assertCanWrite(item, userId, role);

    if (item.status !== ItemStatus.LENT_OUT) {
      throw new BadRequestException('This item is not currently lent out');
    }

    const updated = await this.prisma.item.update({
      where: { id: itemId },
      data: {
        status: ItemStatus.AVAILABLE,
        lentToName: null,
        lentToId: null,
        lentAt: null,
        dueAt: null,
      },
    });

    await this.activity.log({
      placeId,
      actorId: userId,
      action: ActivityAction.ITEM_RETURNED,
      entityType: 'Item',
      entityId: itemId,
      summary: `"${updated.name}" came back from ${item.lentToName}`,
    });

    return updated;
  }

  async remove(userId: string, placeId: string, itemId: string, role: MemberRole) {
    const item = await this.requireItem(userId, placeId, itemId);
    this.assertCanWrite(item, userId, role);

    await this.prisma.item.update({
      where: { id: itemId },
      data: { deletedAt: new Date() },
    });

    await this.activity.log({
      placeId,
      actorId: userId,
      action: ActivityAction.ITEM_DELETED,
      entityType: 'Item',
      entityId: itemId,
      summary: `Deleted "${item.name}"`,
    });

    return { success: true };
  }

  /** Expiring, expired, overdue-to-return and low-stock items across every place. */
  async attention(userId: string, withinDays = 30) {
    const until = new Date();
    until.setDate(until.getDate() + withinDays);

    const scope: Prisma.ItemWhereInput = {
      deletedAt: null,
      place: { deletedAt: null, members: { some: { userId, status: 'ACTIVE' } } },
      ...visibilityFilter(userId),
    };

    const select = {
      id: true,
      name: true,
      placeId: true,
      quantity: true,
      lowStockAt: true,
      expiresAt: true,
      warrantyUntil: true,
      dueAt: true,
      lentToName: true,
      storage: { select: { id: true, name: true } },
      place: { select: { id: true, name: true } },
    } as const;

    const [expiring, warranty, overdue, lowStock] = await Promise.all([
      this.prisma.item.findMany({
        where: { ...scope, expiresAt: { not: null, lte: until } },
        orderBy: { expiresAt: 'asc' },
        select,
      }),
      this.prisma.item.findMany({
        where: { ...scope, warrantyUntil: { not: null, lte: until } },
        orderBy: { warrantyUntil: 'asc' },
        select,
      }),
      this.prisma.item.findMany({
        where: { ...scope, status: ItemStatus.LENT_OUT, dueAt: { not: null, lt: new Date() } },
        orderBy: { dueAt: 'asc' },
        select,
      }),
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT i."id" FROM "items" i
        JOIN "place_members" m ON m."placeId" = i."placeId"
        WHERE m."userId" = ${userId}::uuid
          AND m."status" = 'ACTIVE'
          AND i."deletedAt" IS NULL
          AND i."lowStockAt" IS NOT NULL
          AND i."quantity" <= i."lowStockAt"
          AND (i."visibility" = 'SHARED' OR i."ownerId" = ${userId}::uuid)
      `.then((rows) =>
        rows.length === 0
          ? []
          : this.prisma.item.findMany({
              where: { id: { in: rows.map((row) => row.id) } },
              select,
            }),
      ),
    ]);

    return { expiring, warranty, overdue, lowStock };
  }
}
