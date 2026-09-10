import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Visibility } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trimArray = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? value.map((entry) => String(entry).trim().toLowerCase()).filter(Boolean)
    : value;

export class CreateItemDto {
  @ApiProperty({ example: 'Passport' })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;

  @ApiPropertyOptional({ description: 'Where it is kept. Omit if not put away yet.' })
  @IsOptional()
  @IsUUID()
  storageId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Other names you might search by, e.g. ["charger"] for a Type-C cable',
    example: ['charger', 'cable'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Transform(trimArray)
  aliases?: string[];

  @ApiPropertyOptional({ example: ['documents', 'important'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Transform(trimArray)
  tags?: string[];

  @ApiPropertyOptional({ example: 'Documents' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity?: number;

  @ApiPropertyOptional({ description: 'Warn when quantity drops to this number' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  lowStockAt?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  serialNumber?: string;

  @ApiPropertyOptional({
    enum: Visibility,
    default: Visibility.SHARED,
    description: 'PRIVATE hides this item from every other member of the place',
  })
  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({ example: '2026-01-15T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  purchasedAt?: string;

  @ApiPropertyOptional({ description: 'Medicines, food, documents' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  warrantyUntil?: string;

  @ApiPropertyOptional({ description: 'Remind me about this item at this time' })
  @IsOptional()
  @IsDateString()
  remindAt?: string;

  @ApiPropertyOptional({
    description: 'Base64 photos of where it is kept. First one becomes the cover.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  imagesBase64?: string[];
}
