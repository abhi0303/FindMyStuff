import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'node:path';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { LocalMediaStorage } from './storage/local-media.storage';
import { MEDIA_STORAGES, MediaStorage } from './storage/media-storage';
import { S3MediaStorage } from './storage/s3-media.storage';

@Global()
@Module({
  controllers: [MediaController],
  providers: [
    MediaService,
    {
      provide: MEDIA_STORAGES,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Map<string, MediaStorage> => {
        const storages = new Map<string, MediaStorage>();

        // Always available, so rows written before switching to S3 can
        // still be read wherever their files do exist (e.g. locally).
        const local = new LocalMediaStorage(
          path.resolve(config.getOrThrow<string>('media.localPath')),
        );
        storages.set(local.driver, local);

        // Built whenever it CAN be (bucket and region both present), not only
        // when it is the write driver — so rows written to S3 stay readable
        // even if MEDIA_DRIVER is later set back to local. Requiring the region
        // too matters: the SDK throws "Region is missing" at construction, and
        // a filled-in bucket with no region must not crash an app that is
        // only using local disk. Env validation guarantees both when
        // MEDIA_DRIVER=s3.
        const bucket = config.get<string>('media.s3.bucket');
        const region = config.get<string>('media.s3.region');
        if (bucket && region) {
          const s3 = new S3MediaStorage({
            bucket,
            prefix: config.getOrThrow<string>('media.s3.prefix'),
            region,
            endpoint: config.get<string>('media.s3.endpoint') || undefined,
            forcePathStyle: config.getOrThrow<boolean>('media.s3.forcePathStyle'),
          });
          storages.set(s3.driver, s3);
        }

        return storages;
      },
    },
  ],
  exports: [MediaService],
})
export class MediaModule {}
