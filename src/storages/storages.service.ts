import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityAction, Prisma, Storage } from '@prisma/client';
import { generateLabelCode } from '../common/utils/label-code.util';
import { visibilityFilter } from '../common/utils/visibility.util';
import { ActivityService } from '../activity/activity.service';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStorageDto } from './dto/create-storage.dto';
import { QueryStorageDto } from './dto/query-storage.dto';
import { UpdateStorageDto } from './dto/update-storage.dto';

/** Depth cap — well past anything real, but stops a pathological tree. */
const MAX_DEPTH = 10;

export interface StorageNode extends Storage {
  children: StorageNode[];
  itemCount: number;
}

@Injectable()
export class StoragesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly activity: ActivityService,
  ) {}

  /** Ancestor ids for a node, root first. */
  private ancestorIds(storage: Pick<Storage, 'path'>): string[] {
    return storage.path ? storage.path.split('/') : [];
  }

  /** The path value that a node's own descendants are prefixed with. */
  private subtreePrefix(storage: Pick<Storage, 'id' | 'path'>): string {
    return storage.path ? `${storage.path}/${storage.id}` : storage.id;
  }

  private descendantWhere(storage: Pick<Storage, 'id' | 'path'>): Prisma.StorageWhereInput {
    const prefix = this.subtreePrefix(storage);
    return { OR: [{ path: prefix }, { path: { startsWith: `${prefix}/` } }] };
  }

  /** "Bedroom › Almirah › Top shelf" — resolved from ids so renames stay correct. */
  async breadcrumb(storage: Pick<Storage, 'id' | 'name' | 'path'>): Promise<string> {
    const ids = this.ancestorIds(storage);
    if (ids.length === 0) return storage.name;

    const ancestors = await this.prisma.storage.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });

    const nameById = new Map(ancestors.map((row) => [row.id, row.name]));
    return [...ids.map((id) => nameById.get(id) ?? '?'), storage.name].join(' › ');
  }

  private async requireStorage(placeId: string, storageId: string): Promise<Storage> {
    const storage = await this.prisma.storage.findFirst({
      where: { id: storageId, placeId, deletedAt: null },
    });

    if (!storage) throw new NotFoundException('Storage not found');
    return storage;
  }

  async create(userId: string, placeId: string, dto: CreateStorageDto) {
    const { coverImageBase64, parentId, ...data } = dto;

    let path = '';
    let level = 0;

    if (parentId) {
      const parent = await this.requireStorage(placeId, parentId);
      if (parent.level + 1 > MAX_DEPTH) {
        throw new BadRequestException(`Storages cannot be nested more than ${MAX_DEPTH} deep`);
      }
      path = this.subtreePrefix(parent);
      level = parent.level + 1;
    }

    const coverMediaId = await this.media.createOptional(userId, coverImageBase64);

    const storage = await this.createWithUniqueLabel({
      ...data,
      placeId,
      parentId,
      path,
      level,
      coverMediaId,
      createdById: userId,
    });

    await this.activity.log({
      placeId,
      actorId: userId,
      action: ActivityAction.STORAGE_CREATED,
      entityType: 'Storage',
      entityId: storage.id,
      summary: `Added storage "${await this.breadcrumb(storage)}"`,
    });

    return storage;
  }

  /** labelCode is random and unique; retry the rare collision instead of failing. */
  private async createWithUniqueLabel(
    data: Omit<Prisma.StorageUncheckedCreateInput, 'labelCode'>,
    attempt = 0,
  ): Promise<Storage> {
    try {
      return await this.prisma.storage.create({
        data: { ...data, labelCode: generateLabelCode() },
      });
    } catch (error) {
      const isCollision =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        (error.meta?.target as string[] | undefined)?.includes('labelCode');

      if (isCollision && attempt < 5) {
        return this.createWithUniqueLabel(data, attempt + 1);
      }
      throw error;
    }
  }

  async findAll(userId: string, placeId: string, query: QueryStorageDto) {
    const where: Prisma.StorageWhereInput = {
      placeId,
      deletedAt: null,
      ...(query.rootOnly ? { parentId: null } : {}),
      ...(query.parentId ? { parentId: query.parentId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}),
    };

    const storages = await this.prisma.storage.findMany({
      where,
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
    });

    const counts = await this.itemCounts(
      userId,
      storages.map((storage) => storage.id),
    );

    return Promise.all(
      storages.map(async (storage) => ({
        ...storage,
        breadcrumb: await this.breadcrumb(storage),
        itemCount: counts.get(storage.id) ?? 0,
      })),
    );
  }

  private async itemCounts(userId: string, storageIds: string[]): Promise<Map<string, number>> {
    if (storageIds.length === 0) return new Map();

    const rows = await this.prisma.item.groupBy({
      by: ['storageId'],
      where: { storageId: { in: storageIds }, deletedAt: null, ...visibilityFilter(userId) },
      _count: { _all: true },
    });

    return new Map(rows.map((row) => [row.storageId as string, row._count._all]));
  }

  /** The whole place as a nested tree — what the mobile picker renders. */
  async tree(userId: string, placeId: string): Promise<StorageNode[]> {
    const storages = await this.prisma.storage.findMany({
      where: { placeId, deletedAt: null },
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
    });

    const counts = await this.itemCounts(
      userId,
      storages.map((storage) => storage.id),
    );

    const nodes = new Map<string, StorageNode>(
      storages.map((storage) => [
        storage.id,
        { ...storage, children: [], itemCount: counts.get(storage.id) ?? 0 },
      ]),
    );

    const roots: StorageNode[] = [];
    for (const storage of storages) {
      const node = nodes.get(storage.id)!;
      const parent = storage.parentId ? nodes.get(storage.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }

    return roots;
  }

  async findOne(userId: string, placeId: string, storageId: string) {
    const storage = await this.requireStorage(placeId, storageId);

    const [children, items, breadcrumb] = await Promise.all([
      this.prisma.storage.findMany({
        where: { parentId: storageId, deletedAt: null },
        orderBy: { name: 'asc' },
      }),
      this.prisma.item.findMany({
        where: { storageId, deletedAt: null, ...visibilityFilter(userId) },
        orderBy: { name: 'asc' },
        include: { media: { select: { mediaId: true }, take: 1 } },
      }),
      this.breadcrumb(storage),
    ]);

    return { ...storage, breadcrumb, children, items };
  }

  /** Everything by QR sticker code — the "scan the box" entry point. */
  async findByLabel(userId: string, labelCode: string) {
    const storage = await this.prisma.storage.findFirst({
      where: {
        labelCode: labelCode.trim().toUpperCase(),
        deletedAt: null,
        place: {
          deletedAt: null,
          members: { some: { userId, status: 'ACTIVE' } },
        },
      },
    });

    if (!storage) throw new NotFoundException('No storage found for this code');
    return this.findOne(userId, storage.placeId, storage.id);
  }

  async update(userId: string, placeId: string, storageId: string, dto: UpdateStorageDto) {
    const storage = await this.requireStorage(placeId, storageId);
    const { coverImageBase64, parentId, ...data } = dto;
    const coverMediaId = await this.media.createOptional(userId, coverImageBase64);

    const isMove = parentId !== undefined && parentId !== storage.parentId;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (isMove) {
        await this.reparent(tx, storage, parentId, placeId);
      }

      return tx.storage.update({
        where: { id: storageId },
        data: { ...data, ...(coverMediaId ? { coverMediaId } : {}) },
      });
    });

    await this.activity.log({
      placeId,
      actorId: userId,
      action: ActivityAction.STORAGE_UPDATED,
      entityType: 'Storage',
      entityId: storageId,
      summary: `Updated storage "${await this.breadcrumb(updated)}"`,
    });

    return updated;
  }

  /**
   * Moves a subtree. Paths of every descendant are rewritten in one statement,
   * so moving a room with 200 boxes inside is still a single update.
   */
  private async reparent(
    tx: Prisma.TransactionClient,
    storage: Storage,
    newParentId: string | null,
    placeId: string,
  ) {
    const oldPrefix = this.subtreePrefix(storage);

    let newPath = '';
    let newLevel = 0;

    if (newParentId) {
      const parent = await tx.storage.findFirst({
        where: { id: newParentId, placeId, deletedAt: null },
      });

      if (!parent) throw new NotFoundException('New parent storage not found');

      // A node cannot be moved inside itself or one of its own descendants.
      if (parent.id === storage.id || this.ancestorIds(parent).includes(storage.id)) {
        throw new BadRequestException('A storage cannot be moved inside itself');
      }

      newPath = this.subtreePrefix(parent);
      newLevel = parent.level + 1;
    }

    const subtreeDepth = await tx.storage.aggregate({
      where: { placeId, deletedAt: null, ...this.descendantWhere(storage) },
      _max: { level: true },
    });

    const depthBelow = (subtreeDepth._max.level ?? storage.level) - storage.level;
    if (newLevel + depthBelow > MAX_DEPTH) {
      throw new BadRequestException(`Storages cannot be nested more than ${MAX_DEPTH} deep`);
    }

    const newPrefix = newPath ? `${newPath}/${storage.id}` : storage.id;
    const levelShift = newLevel - storage.level;

    await tx.storage.update({
      where: { id: storage.id },
      data: { parentId: newParentId, path: newPath, level: newLevel },
    });

    // Prisma binds JS numbers as bigint, and substring(text FROM ...) only
    // accepts an integer, hence the explicit casts.
    await tx.$executeRaw`
      UPDATE "storages"
      SET "path" = ${newPrefix} || substring("path" from ${oldPrefix.length + 1}::int),
          "level" = "level" + ${levelShift}::int
      WHERE "placeId" = ${placeId}::uuid
        AND ("path" = ${oldPrefix} OR "path" LIKE ${`${oldPrefix}/%`})
    `;
  }

  /**
   * Soft-deletes a storage and its whole subtree. Items inside are kept but
   * become unassigned, with a movement recorded — deleting a shelf must never
   * silently delete the things that were on it.
   */
  async remove(userId: string, placeId: string, storageId: string) {
    const storage = await this.requireStorage(placeId, storageId);
    const label = await this.breadcrumb(storage);
    const now = new Date();

    const affected = await this.prisma.$transaction(async (tx) => {
      const subtree = await tx.storage.findMany({
        where: { placeId, deletedAt: null, ...this.descendantWhere(storage) },
        select: { id: true, name: true },
      });

      const ids = [storage.id, ...subtree.map((row) => row.id)];

      const items = await tx.item.findMany({
        where: { storageId: { in: ids }, deletedAt: null },
        select: { id: true, storageId: true, name: true },
      });

      if (items.length > 0) {
        await tx.itemMovement.createMany({
          data: items.map((item) => ({
            itemId: item.id,
            fromStorageId: item.storageId,
            toStorageId: null,
            fromLabel: label,
            toLabel: null,
            movedById: userId,
            note: 'Storage was deleted; item is now unassigned',
          })),
        });

        await tx.item.updateMany({
          where: { id: { in: items.map((item) => item.id) } },
          data: { storageId: null },
        });
      }

      await tx.storage.updateMany({ where: { id: { in: ids } }, data: { deletedAt: now } });

      return { storages: ids.length, items: items.length };
    });

    await this.activity.log({
      placeId,
      actorId: userId,
      action: ActivityAction.STORAGE_DELETED,
      entityType: 'Storage',
      entityId: storageId,
      summary: `Deleted storage "${label}"`,
      meta: affected,
    });

    return {
      success: true,
      message:
        affected.items > 0
          ? `Deleted ${affected.storages} storage(s). ${affected.items} item(s) are now unassigned.`
          : `Deleted ${affected.storages} storage(s).`,
      ...affected,
    };
  }
}
