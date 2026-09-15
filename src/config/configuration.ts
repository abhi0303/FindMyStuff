export interface AppConfig {
  env: string;
  port: number;
  apiPrefix: string;
  corsOrigins: string[];
  termsVersion: string;
  swaggerEnabled: boolean;
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: string;
    refreshTtl: string;
  };
  media: {
    driver: string;
    localPath: string;
    maxBytes: number;
    thumbnailWidth: number;
    s3: {
      bucket: string;
      prefix: string;
      region: string;
      endpoint: string;
      forcePathStyle: boolean;
    };
  };
  throttle: {
    ttlSeconds: number;
    limit: number;
    authTtlSeconds: number;
    authLimit: number;
  };
  idempotency: {
    ttlHours: number;
  };
}

const int = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export default (): AppConfig => ({
  env: process.env.NODE_ENV ?? 'development',
  port: int(process.env.PORT, 3000),
  apiPrefix: process.env.API_PREFIX ?? 'api',
  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  termsVersion: process.env.TERMS_VERSION ?? '1',
  // Off in production unless explicitly switched on — handy for letting the
  // frontend developer browse the deployed API.
  swaggerEnabled:
    process.env.SWAGGER_ENABLED === 'true' ||
    (process.env.SWAGGER_ENABLED !== 'false' && process.env.NODE_ENV !== 'production'),
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? '',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? '',
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '30d',
  },
  media: {
    driver: process.env.MEDIA_DRIVER ?? 'local',
    localPath: process.env.MEDIA_LOCAL_PATH ?? './storage/media',
    maxBytes: int(process.env.MEDIA_MAX_BYTES, 8 * 1024 * 1024),
    thumbnailWidth: int(process.env.MEDIA_THUMBNAIL_WIDTH, 320),
    // S3-compatible object storage (Neon object storage, AWS S3, R2, MinIO).
    // Credentials are read by the AWS SDK from AWS_ACCESS_KEY_ID /
    // AWS_SECRET_ACCESS_KEY, so they are deliberately not copied in here.
    s3: {
      bucket: process.env.MEDIA_S3_BUCKET ?? '',
      prefix: process.env.MEDIA_S3_PREFIX ?? 'media',
      region: process.env.AWS_REGION ?? '',
      endpoint: process.env.AWS_ENDPOINT_URL_S3 ?? process.env.AWS_ENDPOINT_URL ?? '',
      forcePathStyle: process.env.MEDIA_S3_FORCE_PATH_STYLE !== 'false',
    },
  },
  throttle: {
    ttlSeconds: int(process.env.THROTTLE_TTL_SECONDS, 60),
    // Kept in sync with THROTTLE_LIMIT's documented default in render.yaml —
    // see the comment there for why 120 was too tight.
    limit: int(process.env.THROTTLE_LIMIT, 300),
    authTtlSeconds: int(process.env.AUTH_THROTTLE_TTL_SECONDS, 300),
    authLimit: int(process.env.AUTH_THROTTLE_LIMIT, 10),
  },
  idempotency: {
    ttlHours: int(process.env.IDEMPOTENCY_KEY_TTL_HOURS, 24),
  },
});
