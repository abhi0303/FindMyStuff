import { GetObjectCommand, PutObjectCommand, S3Client, S3ServiceException } from '@aws-sdk/client-s3';
import { MediaStorage } from './media-storage';

export interface S3MediaStorageOptions {
  bucket: string;
  prefix: string;
  region: string;
  endpoint?: string;
  forcePathStyle: boolean;
}

/**
 * Any S3-compatible object store — Neon object storage, AWS S3, Cloudflare R2,
 * MinIO. Credentials come from the standard AWS_ACCESS_KEY_ID /
 * AWS_SECRET_ACCESS_KEY environment variables via the SDK's default chain.
 *
 * Objects are private. The API reads them server-side and returns the bytes
 * through the existing /media/:id/raw and /thumbnail endpoints, so access is
 * still decided by MediaService's membership and PRIVATE-item checks — a
 * bucket URL is never handed to a client.
 */
export class S3MediaStorage implements MediaStorage {
  readonly driver = 's3';

  private readonly client: S3Client;

  constructor(private readonly options: S3MediaStorageOptions) {
    this.client = new S3Client({
      region: options.region,
      endpoint: options.endpoint,
      forcePathStyle: options.forcePathStyle,
    });
  }

  async put(relativeKey: string, body: Buffer, contentType: string): Promise<string> {
    const key = this.options.prefix
      ? `${this.options.prefix.replace(/\/+$/, '')}/${relativeKey}`
      : relativeKey;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );

    return key;
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.options.bucket, Key: key }),
      );
      if (!result.Body) return null;
      return Buffer.from(await result.Body.transformToByteArray());
    } catch (error) {
      const notFound =
        error instanceof S3ServiceException &&
        (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404);
      if (notFound) return null;
      throw error;
    }
  }
}
