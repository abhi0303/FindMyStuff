import { ApiProperty } from '@nestjs/swagger';
import { ItemStatus } from '@prisma/client';
import { PaginationMeta, PlaceCard } from '../../common/dto/response.dto';

export class SearchItemStorage {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Top shelf' })
  name!: string;

  @ApiProperty({
    example: 'Home › Bedroom › Almirah › Top shelf',
    description: 'Includes the place name — this is the answer to "where did I keep it"',
  })
  breadcrumb!: string;
}

export class SearchItemResult {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Passport' })
  name!: string;

  @ApiProperty({ nullable: true })
  description!: string | null;

  @ApiProperty({ type: [String] })
  tags!: string[];

  @ApiProperty({ type: [String] })
  aliases!: string[];

  @ApiProperty({ example: 1 })
  quantity!: number;

  @ApiProperty({ enum: ItemStatus })
  status!: ItemStatus;

  @ApiProperty({ nullable: true, format: 'date-time' })
  expiresAt!: Date | null;

  @ApiProperty({ nullable: true, format: 'uuid', description: 'Cover photo, if any' })
  mediaId!: string | null;

  @ApiProperty({ type: PlaceCard })
  place!: PlaceCard;

  @ApiProperty({ nullable: true, type: SearchItemStorage })
  storage!: SearchItemStorage | null;

  @ApiProperty({ example: 2.43, description: 'Relevance; results are already sorted by it' })
  score!: number;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}

export class SearchStorageResult {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Almirah' })
  name!: string;

  @ApiProperty({ example: 'ALMIRAH' })
  type!: string;

  @ApiProperty({ example: 'FMS-0QN5EP' })
  labelCode!: string;

  @ApiProperty({ example: 4 })
  itemCount!: number;

  @ApiProperty({ type: PlaceCard })
  place!: PlaceCard;

  @ApiProperty({ example: 'Home › Bedroom › Almirah' })
  breadcrumb!: string;
}

export class SearchResponse {
  @ApiProperty({ example: 'charger', description: 'Echo of what was searched' })
  query!: string;

  @ApiProperty({ type: [SearchItemResult] })
  items!: SearchItemResult[];

  @ApiProperty({ type: PaginationMeta, description: 'Pagination for items only' })
  meta!: PaginationMeta;

  @ApiProperty({
    type: [SearchStorageResult],
    description: 'Storages whose own name matched, capped at 10',
  })
  storages!: SearchStorageResult[];
}
