import { Test } from '@nestjs/testing';
import { ActivityService } from '../activity/activity.service';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';
import { StoragesService } from './storages.service';

const bedroom = {
  id: 'bedroom-id',
  placeId: 'place-1',
  parentId: null,
  name: 'Bedroom',
  path: '',
  level: 0,
};

const almirah = {
  id: 'almirah-id',
  placeId: 'place-1',
  parentId: 'bedroom-id',
  name: 'Almirah',
  path: 'bedroom-id',
  level: 1,
};

const topShelf = {
  id: 'shelf-id',
  placeId: 'place-1',
  parentId: 'almirah-id',
  name: 'Top shelf',
  path: 'bedroom-id/almirah-id',
  level: 2,
};

describe('StoragesService', () => {
  let service: StoragesService;
  let prisma: {
    storage: { findMany: jest.Mock };
    item: { groupBy: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      storage: { findMany: jest.fn() },
      item: { groupBy: jest.fn().mockResolvedValue([]) },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        StoragesService,
        { provide: PrismaService, useValue: prisma },
        { provide: MediaService, useValue: { createOptional: jest.fn() } },
        { provide: ActivityService, useValue: { log: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(StoragesService);
  });

  describe('breadcrumb', () => {
    it('returns just the name for a root storage without querying', async () => {
      await expect(service.breadcrumb(bedroom)).resolves.toBe('Bedroom');
      expect(prisma.storage.findMany).not.toHaveBeenCalled();
    });

    it('resolves ancestor names in path order', async () => {
      prisma.storage.findMany.mockResolvedValue([
        { id: 'almirah-id', name: 'Almirah' },
        { id: 'bedroom-id', name: 'Bedroom' },
      ]);

      await expect(service.breadcrumb(topShelf)).resolves.toBe('Bedroom › Almirah › Top shelf');
    });

    it('resolves ancestor names in one query, whatever the depth', async () => {
      prisma.storage.findMany.mockResolvedValue([
        { id: 'bedroom-id', name: 'Bedroom' },
        { id: 'almirah-id', name: 'Almirah' },
      ]);

      await service.breadcrumb(topShelf);
      expect(prisma.storage.findMany).toHaveBeenCalledTimes(1);
    });

    it('marks an ancestor that has gone missing rather than throwing', async () => {
      prisma.storage.findMany.mockResolvedValue([{ id: 'bedroom-id', name: 'Bedroom' }]);

      await expect(service.breadcrumb(topShelf)).resolves.toBe('Bedroom › ? › Top shelf');
    });
  });

  describe('tree', () => {
    it('nests children under their parents and returns only roots at the top', async () => {
      prisma.storage.findMany.mockResolvedValue([bedroom, almirah, topShelf]);

      const tree = await service.tree('user-1', 'place-1');

      expect(tree).toHaveLength(1);
      expect(tree[0].name).toBe('Bedroom');
      expect(tree[0].children[0].name).toBe('Almirah');
      expect(tree[0].children[0].children[0].name).toBe('Top shelf');
    });

    it('attaches item counts to the right nodes', async () => {
      prisma.storage.findMany.mockResolvedValue([bedroom, almirah]);
      prisma.item.groupBy.mockResolvedValue([{ storageId: 'almirah-id', _count: { _all: 4 } }]);

      const tree = await service.tree('user-1', 'place-1');

      expect(tree[0].itemCount).toBe(0);
      expect(tree[0].children[0].itemCount).toBe(4);
    });

    it('keeps a node whose parent is missing as a root instead of dropping it', async () => {
      prisma.storage.findMany.mockResolvedValue([almirah]);

      const tree = await service.tree('user-1', 'place-1');

      expect(tree).toHaveLength(1);
      expect(tree[0].name).toBe('Almirah');
    });
  });
});
