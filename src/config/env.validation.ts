import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
  validateSync,
} from 'class-validator';

const usesS3 = (env: EnvironmentVariables) => env.MEDIA_DRIVER === 's3';

class EnvironmentVariables {
  @IsOptional()
  @IsIn(['development', 'test', 'production'])
  NODE_ENV?: string;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  /** Unpooled connection used only by migrations. Optional locally. */
  @IsOptional()
  @IsString()
  DIRECT_URL?: string;

  // Short secrets are the single most common way a JWT setup gets broken,
  // so the app refuses to boot rather than start insecurely.
  @IsString()
  @MinLength(32, { message: 'JWT_ACCESS_SECRET must be at least 32 characters' })
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @MinLength(32, { message: 'JWT_REFRESH_SECRET must be at least 32 characters' })
  JWT_REFRESH_SECRET!: string;

  @IsOptional()
  @IsString()
  TERMS_VERSION?: string;

  @IsOptional()
  @IsIn(['local', 's3'], { message: 'MEDIA_DRIVER must be "local" or "s3"' })
  MEDIA_DRIVER?: string;

  // With MEDIA_DRIVER=s3, a missing value would otherwise only surface as a
  // failed upload much later — refuse to boot instead, naming what's missing.
  @ValidateIf(usesS3)
  @IsString()
  @IsNotEmpty({ message: 'MEDIA_S3_BUCKET is required when MEDIA_DRIVER=s3' })
  MEDIA_S3_BUCKET?: string;

  @ValidateIf(usesS3)
  @IsString()
  @IsNotEmpty({ message: 'AWS_REGION is required when MEDIA_DRIVER=s3' })
  AWS_REGION?: string;

  @ValidateIf(usesS3)
  @IsString()
  @IsNotEmpty({ message: 'AWS_ACCESS_KEY_ID is required when MEDIA_DRIVER=s3' })
  AWS_ACCESS_KEY_ID?: string;

  @ValidateIf(usesS3)
  @IsString()
  @IsNotEmpty({ message: 'AWS_SECRET_ACCESS_KEY is required when MEDIA_DRIVER=s3' })
  AWS_SECRET_ACCESS_KEY?: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const parsed = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(parsed, { skipMissingProperties: false });

  if (errors.length > 0) {
    const details = errors
      .map((error) => Object.values(error.constraints ?? {}).join(', '))
      .join('\n  - ');
    throw new Error(`Invalid environment configuration:\n  - ${details}`);
  }

  return config;
}
