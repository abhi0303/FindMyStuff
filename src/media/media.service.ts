import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
// Type-only: erased at compile time, so this costs nothing at runtime and
// does not pull in sharp's native addon — the dynamic import below does that,
// deliberately deferred to first use.
import type { Metadata } from 'sharp';
import { ConfigService } from '@nestjs/config';
import { MemberStatus, Media, Visibility } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MEDIA_STORAGES, MediaStorage } from './storage/media-storage';

const ALLOWED_FORMATS: Record<string, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heif: 'image/heif',
  avif: 'image/avif',
};

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(MEDIA_STORAGES) private readonly storages: Map<string, MediaStorage>,
  ) {}

  /** Where new uploads go, per MEDIA_DRIVER. */
  private get writer(): MediaStorage {
    const driver = this.config.getOrThrow<string>('media.driver');
    const storage = this.storages.get(driver);
    if (!storage) {
      // Env validation already refuses to boot in this state; this is only a
      // guard against the two drifting apart.
      throw new Error(`Media driver "${driver}" is not configured`);
    }
    return storage;
  }

  /**
   * sharp bundles a native libvips addon that costs real memory the moment
   * it is loaded. Importing it dynamically, on first use, keeps that cost off
   * every instance that never handles an image upload during its lifetime —
   * meaningful on a memory-constrained free-tier container.
   */
  private async sharp() {
    const { default: sharp } = await import('sharp');
    return sharp;
  }

  private decodeBase64(input: string): Buffer {
    const raw =
      input.includes(',') && input.trimStart().startsWith('data:')
        ? input.slice(input.indexOf(',') + 1)
        : input;

    const cleaned = raw.replace(/\s/g, '');

    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned)) {
      throw new BadRequestException('Image is not valid base64');
    }

    const maxBytes = this.config.getOrThrow<number>('media.maxBytes');
    // Reject on the encoded length first so an oversized payload is never
    // materialised as a Buffer.
    if ((cleaned.length * 3) / 4 > maxBytes) {
      throw new BadRequestException(
        `Image is larger than the ${Math.round(maxBytes / 1024 / 1024)}MB limit`,
      );
    }

    return Buffer.from(cleaned, 'base64');
  }

  /**
   * Base64 comes in from the apps, but is decoded and written to the
   * configured storage (object storage in production). Only a small row goes
   * into the database, so listing items never drags image bytes along with it.
   */
  async createFromBase64(userId: string, base64: string): Promise<Media> {
    const buffer = this.decodeBase64(base64);

    if (buffer.length === 0) {
      throw new BadRequestException('Image is empty');
    }

    const sharp = await this.sharp();

    let metadata: Metadata;
    try {
      metadata = await sharp(buffer).metadata();
    } catch {
      throw new BadRequestException('File is not a readable image');
    }

    const format = metadata.format ?? '';
    const mimeType = ALLOWED_FORMATS[format];

    if (!mimeType) {
      throw new BadRequestException(
        `Unsupported image format. Allowed: ${Object.keys(ALLOWED_FORMATS).join(', ')}`,
      );
    }

    const checksum = createHash('sha256').update(buffer).digest('hex');
    const writer = this.writer;

    // The same photo uploaded twice reuses the stored file — but only one
    // stored by the CURRENT driver. A row from the old disk driver on Render
    // points at a file that a deploy has already wiped; handing that id back
    // would give the new upload a permanently broken image.
    const existing = await this.prisma.media.findFirst({
      where: { checksum, ownerId: userId, deletedAt: null, driver: writer.driver },
    });
    if (existing) return existing;

    const id = randomUUID();
    const folder = id.slice(0, 2);

    const thumbnailWidth = this.config.getOrThrow<number>('media.thumbnailWidth');
    const thumbnail = await sharp(buffer)
      .rotate() // honour EXIF orientation before stripping metadata
      .resize({ width: thumbnailWidth, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    const [storageKey, thumbnailKey] = await Promise.all([
      writer.put(`${folder}/${id}.${format}`, buffer, mimeType),
      writer.put(`${folder}/${id}.thumb.webp`, thumbnail, 'image/webp'),
    ]);

    return this.prisma.media.create({
      data: {
        id,
        ownerId: userId,
        driver: writer.driver,
        storageKey,
        thumbnailKey,
        mimeType,
        sizeBytes: buffer.length,
        width: metadata.width,
        height: metadata.height,
        checksum,
      },
    });
  }

  /** Convenience for endpoints that accept an optional inline image. */
  async createOptional(userId: string, base64?: string): Promise<string | undefined> {
    if (!base64) return undefined;
    const media = await this.createFromBase64(userId, base64);
    return media.id;
  }

  /**
   * A media row is readable by its uploader, or by any active member of a place
   * where it is used — subject to the same PRIVATE-item rule as the item itself.
   */
  private async assertReadable(userId: string, mediaId: string): Promise<Media> {
    const media = await this.prisma.media.findFirst({
      where: { id: mediaId, deletedAt: null },
    });

    if (!media) throw new NotFoundException('Media not found');
    if (media.ownerId === userId) return media;

    const memberPlaces = {
      members: { some: { userId, status: MemberStatus.ACTIVE } },
      deletedAt: null,
    };

    const [linkedItem, placeCover, storageCover] = await Promise.all([
      this.prisma.itemMedia.findFirst({
        where: {
          mediaId,
          item: {
            deletedAt: null,
            place: memberPlaces,
            OR: [{ visibility: Visibility.SHARED }, { ownerId: userId }],
          },
        },
        select: { itemId: true },
      }),
      this.prisma.place.findFirst({ where: { coverMediaId: mediaId, ...memberPlaces } }),
      this.prisma.storage.findFirst({
        where: { coverMediaId: mediaId, deletedAt: null, place: memberPlaces },
      }),
    ]);

    if (!linkedItem && !placeCover && !storageCover) {
      throw new NotFoundException('Media not found');
    }

    return media;
  }

  async read(userId: string, mediaId: string, variant: 'original' | 'thumbnail') {
    const media = await this.assertReadable(userId, mediaId);
    const key =
      variant === 'thumbnail' ? (media.thumbnailKey ?? media.storageKey) : media.storageKey;

    // Read from whichever driver WROTE this row, not the current one.
    const storage = this.storages.get(media.driver);
    if (!storage) {
      this.logger.error(`Media ${mediaId} uses driver "${media.driver}", which is not configured`);
      throw new NotFoundException('Media file is unavailable');
    }

    const buffer = await storage.get(key);
    if (!buffer) {
      this.logger.warn(`Missing media file for ${mediaId} (${media.driver}): ${key}`);
      throw new NotFoundException('Media file is unavailable');
    }

    return {
      buffer,
      mimeType: variant === 'thumbnail' && media.thumbnailKey ? 'image/webp' : media.mimeType,
    };
  }

  async metadata(userId: string, mediaId: string) {
    const media = await this.assertReadable(userId, mediaId);
    const { storageKey: _s, thumbnailKey: _t, ...rest } = media;
    return rest;
  }

  /** Soft-deletes an uploader's own media. Files are swept separately. */
  async remove(userId: string, mediaId: string) {
    const result = await this.prisma.media.updateMany({
      where: { id: mediaId, ownerId: userId, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    if (result.count === 0) throw new NotFoundException('Media not found');
    return { success: true };
  }
}
