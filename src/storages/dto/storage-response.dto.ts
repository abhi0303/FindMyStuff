import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StorageType } from '@prisma/client';

export class StorageResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  placeId!: string;

  @ApiProperty({ nullable: true, format: 'uuid', description: 'Null for a top-level storage' })
  parentId!: string | null;

  @ApiProperty({ example: 'Almirah' })
  name!: string;

  @ApiProperty({ enum: StorageType })
  type!: StorageType;

  @ApiProperty({ nullable: true })
  description!: string | null;

  @ApiProperty({
    example: '3f2a…/9b1c…',
    description: 'Ancestor ids, root first, slash separated. Empty for a root storage.',
  })
  path!: string;

  @ApiProperty({ example: 2, description: 'Depth in the tree; 0 is top level' })
  level!: number;

  @ApiProperty({ example: 'FMS-7K3QX2', description: 'Print this as a QR sticker on the box' })
  labelCode!: string;

  @ApiProperty({ nullable: true, format: 'uuid' })
  coverMediaId!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}

/** GET /places/{placeId}/storages — the flat list that feeds the dropdown. */
export class StorageListItemResponse extends StorageResponse {
  @ApiProperty({
    example: 'Bedroom › Almirah › Top shelf',
    description: 'Ready to render — ancestor names resolved at read time',
  })
  breadcrumb!: string;

  @ApiProperty({ example: 4 })
  itemCount!: number;
}

/** GET /places/{placeId}/storages/tree — recursive. */
export class StorageNodeResponse extends StorageResponse {
  @ApiProperty({ type: () => [StorageNodeResponse], description: 'Nested child storages' })
  children!: StorageNodeResponse[];

  @ApiProperty({ example: 4 })
  itemCount!: number;
}

export class StorageDeletedResponse {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 'Deleted 3 storage(s). 7 item(s) are now unassigned.' })
  message!: string;

  @ApiProperty({ example: 3, description: 'Storages soft-deleted, including the subtree' })
  storages!: number;

  @ApiProperty({ example: 7, description: 'Items that became unassigned rather than deleted' })
  items!: number;
}

export class StorageDetailResponse extends StorageResponse {
  @ApiProperty({ example: 'Bedroom › Almirah › Top shelf' })
  breadcrumb!: string;

  @ApiProperty({ type: [StorageResponse], description: 'Direct children only' })
  children!: StorageResponse[];

  @ApiPropertyOptional({ description: 'Items directly inside this storage', type: 'array', items: { type: 'object' } })
  items?: unknown[];
}
