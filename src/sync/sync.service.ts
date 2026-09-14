import { Injectable, NotFoundException } from '@nestjs/common';
import { MemberStatus } from '@prisma/client';
import { visibilityFilter } from '../common/utils/visibility.util';
import { PrismaService } from '../prisma/prisma.service';
import { SyncQueryDto } from './dto/sync-query.dto';

/**
 * Generous for this app's realistic scale (a household's belongings, not an
 * enterprise catalogue) — see the truncation comment below for what happens
 * if a single call ever exceeds it.
 */
const PAGE_CAP = 1000;
const EPOCH = new Date(0);

interface CappedResult<T extends { updatedAt: Date }> {
  rows: T[];
  truncatedAt: Date | null;
}

@Injectable()
export class SyncService {
  constructor(private readonly prisma: PrismaService) {}

  async sync(userId: string, query: SyncQueryDto) {
    const since = query.since ? new Date(query.since) : EPOCH;
    const { live: placeIds, withDeleted: placeIdsWithDeleted } = await this.resolvePlaceIds(
      userId,
      query.placeId,
    );

    if (placeIdsWithDeleted.length === 0) {
      return {
        serverTime: new Date().toISOString(),
        places: [],
        storages: [],
        items: [],
        deleted: { places: [], storages: [], items: [] },
        truncated: false,
      };
    }

    const [places, storages, items, deletedPlaceIds, deletedStorageIds, deletedItemIds] =
      await Promise.all([
        this.changedPlaces(placeIds, since),
        this.changedStorages(placeIds, since),
        this.changedItems(userId, placeIds, since),
        // Deletions are looked up across places that are themselves deleted
        // too — otherwise deleting a place would drop it from scope and its
        // own deletion (and its children's) would never be reported.
        this.deletedIds('place', placeIdsWithDeleted, since),
        this.deletedIds('storage', placeIdsWithDeleted, since),
        this.deletedItemIds(userId, placeIdsWithDeleted, since),
      ]);

    // A single shared cursor is used for the next call. When anything was
    // truncated, the cursor must be the EARLIEST cutoff among the truncated
    // arrays — anything later could silently skip changes. Non-truncated
    // arrays may redeliver a few already-seen rows on the next call as a
    // result; that is harmless (the client just upserts over them again).
    const cutoffs = [
      places.truncatedAt,
      storages.truncatedAt,
      items.truncatedAt,
      deletedPlaceIds.truncatedAt,
      deletedStorageIds.truncatedAt,
      deletedItemIds.truncatedAt,
    ].filter((d): d is Date => d !== null);

    const truncated = cutoffs.length > 0;
    const serverTime = truncated
      ? new Date(Math.min(...cutoffs.map((d) => d.getTime()))).toISOString()
      : new Date().toISOString();

    return {
      serverTime,
      places: places.rows,
      storages: storages.rows,
      items: items.rows,
      deleted: {
        places: deletedPlaceIds.rows.map((r) => r.id),
        storages: deletedStorageIds.rows.map((r) => r.id),
        items: deletedItemIds.rows.map((r) => r.id),
      },
      truncated,
    };
  }

  /**
   * The places this sync covers, in two sets:
   * - `live`: not deleted — used for created/changed rows.
   * - `withDeleted`: also includes soft-deleted places the user is still an
   *   active member of — used for deletions, so a deleted place (and every
   *   storage and item deleted with it) is actually reported instead of
   *   silently falling out of scope.
   *
   * A specific placeId the user was never a member of is a 404, never a
   * confirmation that it exists.
   */
  private async resolvePlaceIds(
    userId: string,
    onlyPlaceId?: string,
  ): Promise<{ live: string[]; withDeleted: string[] }> {
    const memberships = await this.prisma.placeMember.findMany({
      where: {
        userId,
        status: MemberStatus.ACTIVE,
        ...(onlyPlaceId ? { placeId: onlyPlaceId } : {}),
      },
      select: { placeId: true, place: { select: { deletedAt: true } } },
    });

    if (onlyPlaceId && memberships.length === 0) {
      throw new NotFoundException('Place not found');
    }

    return {
      live: memberships.filter((m) => m.place.deletedAt === null).map((m) => m.placeId),
      withDeleted: memberships.map((m) => m.placeId),
    };
  }

  /**
   * Caps at PAGE_CAP+1 purely to detect truncation cheaply, then trims back
   * to PAGE_CAP — except never mid-way through a group of rows that share
   * the exact same updatedAt. A batch write (StoragesService.remove()
   * soft-deletes a whole subtree in one updateMany, for instance) can leave
   * many rows with an identical timestamp; the cursor for "the next call"
   * is that timestamp itself, and `updatedAt > since` is a strict
   * inequality, so a row left on the wrong side of that exact value would
   * never be delivered on any later call. Cutting before the tied group
   * instead means this page can come back shorter than PAGE_CAP in that
   * case, but nothing is ever silently skipped.
   */
  private cap<T extends { updatedAt: Date }>(rows: T[]): CappedResult<T> {
    if (rows.length <= PAGE_CAP) return { rows, truncatedAt: null };

    // Every caller fetches PAGE_CAP + 1 rows, so there is always exactly one
    // "first excluded" row to compare the naive boundary against.
    const lastIncluded = rows[PAGE_CAP - 1].updatedAt.getTime();
    const firstExcluded = rows[PAGE_CAP].updatedAt.getTime();

    let cut = PAGE_CAP;
    if (lastIncluded === firstExcluded) {
      // The naive cut lands mid-tie — back up to before the tied group
      // starts, so nothing tied at the boundary is ever split across pages.
      while (cut > 0 && rows[cut - 1].updatedAt.getTime() === lastIncluded) {
        cut -= 1;
      }
      // The entire fetched batch shares one timestamp (PAGE_CAP+1 rows tied
      // at once) — cutting further back would return nothing at all, which
      // is worse than the vanishingly unlikely risk this guards against, so
      // fall back to the plain positional cut in that one case.
      if (cut === 0) cut = PAGE_CAP;
    }

    const trimmed = rows.slice(0, cut);
    return { rows: trimmed, truncatedAt: trimmed[trimmed.length - 1].updatedAt };
  }

  private async changedPlaces(placeIds: string[], since: Date) {
    const rows = await this.prisma.place.findMany({
      where: { id: { in: placeIds }, deletedAt: null, updatedAt: { gt: since } },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: PAGE_CAP + 1,
    });
    return this.cap(rows);
  }

  private async changedStorages(placeIds: string[], since: Date) {
    const rows = await this.prisma.storage.findMany({
      where: { placeId: { in: placeIds }, deletedAt: null, updatedAt: { gt: since } },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: PAGE_CAP + 1,
    });
    return this.cap(rows);
  }

  /** PRIVATE items stay invisible to everyone but their owner — same rule as every other item read path. */
  private async changedItems(userId: string, placeIds: string[], since: Date) {
    const rows = await this.prisma.item.findMany({
      where: {
        placeId: { in: placeIds },
        deletedAt: null,
        updatedAt: { gt: since },
        ...visibilityFilter(userId),
      },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: PAGE_CAP + 1,
    });
    return this.cap(rows);
  }

  private async deletedIds(
    entity: 'place' | 'storage',
    placeIds: string[],
    since: Date,
  ): Promise<CappedResult<{ id: string; updatedAt: Date }>> {
    const where =
      entity === 'place'
        ? { id: { in: placeIds }, deletedAt: { not: null, gt: since } }
        : { placeId: { in: placeIds }, deletedAt: { not: null, gt: since } };

    const rows =
      entity === 'place'
        ? await this.prisma.place.findMany({
            where,
            select: { id: true, updatedAt: true },
            orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
            take: PAGE_CAP + 1,
          })
        : await this.prisma.storage.findMany({
            where,
            select: { id: true, updatedAt: true },
            orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
            take: PAGE_CAP + 1,
          });

    return this.cap(rows);
  }

  /**
   * Deletions of a PRIVATE item must stay invisible to everyone but its
   * owner too — otherwise merely announcing "item X was deleted" leaks that
   * X existed to someone who was never allowed to see it.
   */
  private async deletedItemIds(userId: string, placeIds: string[], since: Date) {
    const rows = await this.prisma.item.findMany({
      where: {
        placeId: { in: placeIds },
        deletedAt: { not: null, gt: since },
        ...visibilityFilter(userId),
      },
      select: { id: true, updatedAt: true },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: PAGE_CAP + 1,
    });
    return this.cap(rows);
  }
}
