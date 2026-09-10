import { ApiPropertyOptional } from '@nestjs/swagger';
import { StorageType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

export class QueryStorageDto {
  @ApiPropertyOptional({ description: 'Only direct children of this storage' })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional({ enum: StorageType })
  @IsOptional()
  @IsEnum(StorageType)
  type?: StorageType;

  @ApiPropertyOptional({ description: 'Match part of the storage name' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Return only root storages', default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  rootOnly?: boolean;
}
