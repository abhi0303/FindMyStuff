import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class SearchQueryDto extends PaginationDto {
  @ApiProperty({ example: 'passport', description: 'What are you looking for?' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  q!: string;

  @ApiPropertyOptional({ description: 'Restrict to one place. Omit to search everywhere.' })
  @IsOptional()
  @IsUUID()
  placeId?: string;

  @ApiPropertyOptional({ description: 'Also return matching storages', default: true })
  @IsOptional()
  @Transform(({ value }) => value !== false && value !== 'false')
  @IsBoolean()
  includeStorages?: boolean = true;

  @ApiPropertyOptional({ description: 'Include deleted/discarded things', default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeArchived?: boolean = false;
}
