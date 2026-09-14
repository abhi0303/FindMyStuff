import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { SyncService } from './sync.service';

const asOf = (isoOffsetMs: number) => new Date(1_700_000_000_000 + isoOffsetMs);

describe('SyncService', () => {
  let service: SyncService;
  let prisma: {
    placeMember: { findMany: jest.Mock };
    place: { findMany: jest.Mock };
    storage: { findMany: jest.Mock };
    item: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      placeMember: { findMany: jest.fn() },
      place: { findMany: jest.fn().mockResolvedValue([]) },
      storage: { findMany: jest.fn().mockResolvedValue([]) },
      item: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [SyncService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(SyncService);
  });

  describe('resolvePlaceIds (via sync)', () => {
    it('404s a specific placeId the user is not an active member of, rather than confirming its non-existence', async () => {
      prisma.placeMember.findMany.mockResolvedValue([]);

      await expect(service.sync('user-1', { placeId: 'place-x' })).rejects.toThrow(NotFoundException);
    });

    it('returns an empty, well-formed payload for a user with no places at all', async () => {
      prisma.placeMember.findMany.mockResolvedValue([]);

      const result = await service.sync('user-1', {});

      expect(result.places).toEqual([]);
      expect(result.deleted).toEqual({ places: [], storages: [], items: [] });
      expect(result.truncated).toBe(false);
      // No membership rows to query against, so the expensive queries must
      // never even run.
      expect(prisma.place.findMany).not.toHaveBeenCalled();
    });
  });

  describe('truncation and the tie-breaking cursor', () => {
    const PAGE_CAP = 1000;

    it('does not mark a response truncated when everything fits in one page', async () => {
      prisma.placeMember.findMany.mockResolvedValue([{ placeId: 'p1', place: { deletedAt: null } }]);
      prisma.item.findMany.mockResolvedValue(
        Array.from({ length: 5 }, (_, i) => ({ id: `item-${i}`, updatedAt: asOf(i) })),
      );

      const result = await service.sync('user-1', {});

      expect(result.truncated).toBe(false);
    });

    it('cuts back before a group of rows tied at the exact truncation boundary, so none are lost', async () => {
      prisma.placeMember.findMany.mockResolvedValue([{ placeId: 'p1', place: { deletedAt: null } }]);

      // Rows 0..998 each have a distinct timestamp; rows 999 and 1000 (index)
      // — i.e. the 1000th and 1001st rows — share the EXACT same updatedAt.
      // A naive positional cut at PAGE_CAP would keep row 999 and silently
      // drop row 1000 forever, since the next call's `since` would equal
      // its own updatedAt and `updatedAt > since` excludes ties.
      const tiedTime = asOf(999);
      const rows = [
        ...Array.from({ length: PAGE_CAP - 1 }, (_, i) => ({ id: `item-${i}`, updatedAt: asOf(i) })),
        { id: 'item-tied-a', updatedAt: tiedTime },
        { id: 'item-tied-b', updatedAt: tiedTime },
      ];
      expect(rows).toHaveLength(PAGE_CAP + 1);
      prisma.item.findMany.mockResolvedValue(rows);

      const result = await service.sync('user-1', {});

      expect(result.truncated).toBe(true);
      // Both members of the tied group were held back together, not split.
      expect(result.items.some((i) => i.id === 'item-tied-a')).toBe(false);
      expect(result.items.some((i) => i.id === 'item-tied-b')).toBe(false);
      expect(result.items).toHaveLength(PAGE_CAP - 1);
      // The returned cursor sits strictly before the tied group, so a
      // follow-up call with it as `since` is guaranteed to include both.
      expect(new Date(result.serverTime).getTime()).toBeLessThan(tiedTime.getTime());
    });

    it('falls back to a plain positional cut when the ENTIRE fetched page shares one timestamp', async () => {
      prisma.placeMember.findMany.mockResolvedValue([{ placeId: 'p1', place: { deletedAt: null } }]);

      const tiedTime = asOf(1);
      const rows = Array.from({ length: PAGE_CAP + 1 }, (_, i) => ({ id: `item-${i}`, updatedAt: tiedTime }));
      prisma.item.findMany.mockResolvedValue(rows);

      const result = await service.sync('user-1', {});

      // Returning nothing at all would be worse than the vanishingly small
      // risk this guards against — some progress must still be made.
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.truncated).toBe(true);
    });

    it('uses the EARLIEST cutoff across entity types as the shared cursor, never a later one', async () => {
      prisma.placeMember.findMany.mockResolvedValue([{ placeId: 'p1', place: { deletedAt: null } }]);

      const itemRows = [
        ...Array.from({ length: PAGE_CAP }, (_, i) => ({ id: `item-${i}`, updatedAt: asOf(1000 + i) })),
        { id: 'item-overflow', updatedAt: asOf(5000) },
      ];
      const storageRows = [
        ...Array.from({ length: PAGE_CAP }, (_, i) => ({ id: `storage-${i}`, updatedAt: asOf(10 + i) })),
        { id: 'storage-overflow', updatedAt: asOf(2000) },
      ];
      prisma.item.findMany.mockResolvedValue(itemRows);
      prisma.storage.findMany.mockResolvedValue(storageRows);

      const result = await service.sync('user-1', {});

      // Storages truncate at an earlier point in time than items do here —
      // using the LATER (items') cutoff would skip whatever storage changes
      // fall between the two cutoffs.
      const storageCutoff = storageRows[PAGE_CAP - 1].updatedAt.getTime();
      const itemCutoff = itemRows[PAGE_CAP - 1].updatedAt.getTime();
      expect(storageCutoff).toBeLessThan(itemCutoff);
      expect(new Date(result.serverTime).getTime()).toBe(storageCutoff);
    });
  });

  describe('deleted ids', () => {
    it('reports only the ids of deleted records, not their full rows', async () => {
      prisma.placeMember.findMany.mockResolvedValue([{ placeId: 'p1', place: { deletedAt: null } }]);
      prisma.item.findMany.mockResolvedValueOnce([]); // changed items
      prisma.item.findMany.mockResolvedValueOnce([
        { id: 'deleted-item-1', updatedAt: asOf(1) },
      ]); // deleted items

      const result = await service.sync('user-1', {});

      expect(result.deleted.items).toEqual(['deleted-item-1']);
    });
  });

  describe('deleted places', () => {
    it('still reports a deleted place and its children, instead of dropping it from scope', async () => {
      prisma.placeMember.findMany.mockResolvedValue([
        { placeId: 'gone', place: { deletedAt: asOf(50) } },
      ]);
      // Changed-row queries run first in Promise.all order, deletion queries after.
      prisma.place.findMany
        .mockResolvedValueOnce([]) // changed places (live scope is empty)
        .mockResolvedValueOnce([{ id: 'gone', updatedAt: asOf(50) }]); // deleted places
      prisma.storage.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'gone-storage', updatedAt: asOf(50) }]);
      prisma.item.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'gone-item', updatedAt: asOf(50) }]);

      const result = await service.sync('user-1', { since: asOf(10).toISOString() });

      expect(result.deleted.places).toEqual(['gone']);
      expect(result.deleted.storages).toEqual(['gone-storage']);
      expect(result.deleted.items).toEqual(['gone-item']);
    });

    it('queries changed rows only across live places, never deleted ones', async () => {
      prisma.placeMember.findMany.mockResolvedValue([
        { placeId: 'live', place: { deletedAt: null } },
        { placeId: 'gone', place: { deletedAt: asOf(50) } },
      ]);

      await service.sync('user-1', {});

      const changedItemsWhere = prisma.item.findMany.mock.calls[0][0].where;
      const deletedItemsWhere = prisma.item.findMany.mock.calls[1][0].where;
      expect(changedItemsWhere.placeId).toEqual({ in: ['live'] });
      expect(deletedItemsWhere.placeId).toEqual({ in: ['live', 'gone'] });
    });
  });
});
