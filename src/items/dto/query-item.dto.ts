import { ApiPropertyOptional } from '@nestjs/swagger';
import { ItemStatus, Visibility } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class QueryItemDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Free text over name, aliases, tags and description' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  storageId?: string;

  @ApiPropertyOptional({
    description: 'Include items in nested storages under storageId',
    default: true,
  })
  @IsOptional()
  @Transform(({ value }) => value !== false && value !== 'false')
  @IsBoolean()
  includeNested?: boolean = true;

  @ApiPropertyOptional({ enum: ItemStatus })
  @IsOptional()
  @IsEnum(ItemStatus)
  status?: ItemStatus;

  @ApiPropertyOptional({ enum: Visibility })
  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tag?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Only items expiring within this many days' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expiringInDays?: number;

  @ApiPropertyOptional({ description: 'Only items at or below their low-stock threshold' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  lowStock?: boolean;

  @ApiPropertyOptional({
    enum: ['name', 'createdAt', 'updatedAt', 'expiresAt'],
    default: 'updatedAt',
  })
  @IsOptional()
  @IsEnum(['name', 'createdAt', 'updatedAt', 'expiresAt'])
  sortBy?: 'name' | 'createdAt' | 'updatedAt' | 'expiresAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
