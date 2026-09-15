import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { MediaService } from './media.service';
import { MEDIA_STORAGES, MediaStorage } from './storage/media-storage';

// 1x1 transparent PNG
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const fakeStorage = (driver: string): jest.Mocked<MediaStorage> => ({
  driver,
  put: jest.fn(async (key: string, _body: Buffer, _contentType: string) => `${driver}-prefix/${key}`),
  get: jest.fn(),
});

describe('MediaService storage drivers', () => {
  let service: MediaService;
  let local: jest.Mocked<MediaStorage>;
  let s3: jest.Mocked<MediaStorage>;
  let prisma: { media: { findFirst: jest.Mock; create: jest.Mock } };

  beforeEach(async () => {
    local = fakeStorage('local');
    s3 = fakeStorage('s3');
    prisma = {
      media: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }) => data),
      },
    };

    const config: Record<string, unknown> = {
      'media.driver': 's3',
      'media.maxBytes': 8 * 1024 * 1024,
      'media.thumbnailWidth': 320,
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MediaService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { getOrThrow: (key: string) => config[key], get: (key: string) => config[key] },
        },
        {
          provide: MEDIA_STORAGES,
          useValue: new Map<string, MediaStorage>([
            ['local', local],
            ['s3', s3],
          ]),
        },
      ],
    }).compile();

    service = moduleRef.get(MediaService);
  });

  it('writes new uploads to the configured driver and records it on the row', async () => {
    const row = await service.createFromBase64('user-1', PNG);

    expect(s3.put).toHaveBeenCalledTimes(2); // original + thumbnail
    expect(local.put).not.toHaveBeenCalled();
    expect(row.driver).toBe('s3');
  });

  it('persists the key the driver returned (prefix included), not the relative one', async () => {
    const row = await service.createFromBase64('user-1', PNG);

    expect(row.storageKey).toMatch(/^s3-prefix\/[0-9a-f]{2}\/[0-9a-f-]+\.png$/);
    expect(row.thumbnailKey).toMatch(/^s3-prefix\/[0-9a-f]{2}\/[0-9a-f-]+\.thumb\.webp$/);
  });

  it('only reuses a duplicate upload stored by the current driver', async () => {
    await service.createFromBase64('user-1', PNG);

    // A row whose file lived on Render's wiped disk must not be handed back.
    expect(prisma.media.findFirst.mock.calls[0][0].where.driver).toBe('s3');
  });

  describe('read', () => {
    const rowFor = (driver: string) => ({
      id: 'media-1',
      ownerId: 'user-1',
      driver,
      storageKey: 'k/original.png',
      thumbnailKey: 'k/thumb.webp',
      mimeType: 'image/png',
      deletedAt: null,
    });

    it('reads from the driver that wrote the row, even after MEDIA_DRIVER changed', async () => {
      prisma.media.findFirst.mockResolvedValue(rowFor('local'));
      local.get.mockResolvedValue(Buffer.from('bytes'));

      const result = await service.read('user-1', 'media-1', 'original');

      expect(local.get).toHaveBeenCalledWith('k/original.png');
      expect(s3.get).not.toHaveBeenCalled();
      expect(result.mimeType).toBe('image/png');
    });

    it('serves the webp thumbnail key and type for the thumbnail variant', async () => {
      prisma.media.findFirst.mockResolvedValue(rowFor('s3'));
      s3.get.mockResolvedValue(Buffer.from('thumb'));

      const result = await service.read('user-1', 'media-1', 'thumbnail');

      expect(s3.get).toHaveBeenCalledWith('k/thumb.webp');
      expect(result.mimeType).toBe('image/webp');
    });

    it('returns 404 when the object is missing', async () => {
      prisma.media.findFirst.mockResolvedValue(rowFor('s3'));
      s3.get.mockResolvedValue(null);

      await expect(service.read('user-1', 'media-1', 'original')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns 404 when the row names a driver that is not configured', async () => {
      prisma.media.findFirst.mockResolvedValue(rowFor('gcs'));

      await expect(service.read('user-1', 'media-1', 'original')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
