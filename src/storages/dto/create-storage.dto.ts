import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LengthUnit, StorageType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateStorageDto {
  @ApiPropertyOptional({
    description:
      'Client-generated UUID. Optional — omit to let the server assign one. ' +
      'Set this when creating offline so the real, final id is known immediately ' +
      "and nested offline creates (e.g. an item inside a storage that doesn't " +
      "exist on the server yet) can reference it without a swap-after-sync step. " +
      'Pair with an Idempotency-Key header so a retried request cannot create a second row.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ example: 'Almirah' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;

  @ApiPropertyOptional({ enum: StorageType, default: StorageType.OTHER })
  @IsOptional()
  @IsEnum(StorageType)
  type?: StorageType;

  @ApiPropertyOptional({
    description: 'Parent storage id. Omit for a top-level storage such as a room.',
  })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  widthValue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  lengthValue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  heightValue?: number;

  @ApiPropertyOptional({ enum: LengthUnit })
  @IsOptional()
  @IsEnum(LengthUnit)
  lengthUnit?: LengthUnit;

  @ApiPropertyOptional({ description: 'Useful for a bank locker or a box kept elsewhere' })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({ description: 'Base64 photo of the storage, e.g. the open almirah' })
  @IsOptional()
  @IsString()
  coverImageBase64?: string;
}
