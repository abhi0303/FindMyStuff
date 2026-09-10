import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ItemStatus, Visibility } from '@prisma/client';
import { PaginationMeta, UserCard } from '../../common/dto/response.dto';

export class ItemStorageRef {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Top shelf' })
  name!: string;

  @ApiProperty({
    example: 'Bedroom › Almirah › Top shelf',
    description: 'Where the thing is — render this directly',
  })
  breadcrumb!: string;
}

export class ItemResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  placeId!: string;

  @ApiProperty({ example: 'Passport' })
  name!: string;

  @ApiProperty({ nullable: true, example: 'Inside the brown document folder' })
  description!: string | null;

  @ApiProperty({ type: [String], example: ['charger', 'cable'] })
  aliases!: string[];

  @ApiProperty({ type: [String], example: ['documents', 'important'] })
  tags!: string[];

  @ApiProperty({ nullable: true, example: 'Documents' })
  category!: string | null;

  @ApiProperty({ example: 1 })
  quantity!: number;

  @ApiProperty({ nullable: true, example: 1 })
  lowStockAt!: number | null;

  @ApiProperty({ enum: ItemStatus })
  status!: ItemStatus;

  @ApiProperty({ enum: Visibility, description: 'PRIVATE is visible only to ownerId' })
  visibility!: Visibility;

  @ApiProperty({ format: 'uuid' })
  ownerId!: string;

  @ApiProperty({ nullable: true, format: 'date-time' })
  expiresAt!: Date | null;

  @ApiProperty({ nullable: true, format: 'date-time' })
  warrantyUntil!: Date | null;

  @ApiProperty({ nullable: true, example: 'Rahul (neighbour)' })
  lentToName!: string | null;

  @ApiProperty({ nullable: true, format: 'date-time' })
  dueAt!: Date | null;

  @ApiProperty({ nullable: true, type: ItemStorageRef })
  storage!: ItemStorageRef | null;

  @ApiProperty({
    type: [String],
    description: 'Fetch each at /media/{id}/thumbnail or /media/{id}/raw',
  })
  mediaIds!: string[];

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}

export class ItemMovementResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ nullable: true, format: 'uuid' })
  fromStorageId!: string | null;

  @ApiProperty({ nullable: true, format: 'uuid' })
  toStorageId!: string | null;

  @ApiProperty({ nullable: true, example: 'Bedroom › Almirah › Top shelf' })
  fromLabel!: string | null;

  @ApiProperty({ nullable: true, example: 'Bedroom › Under the bed › Blue box' })
  toLabel!: string | null;

  @ApiProperty({ nullable: true, example: 'Shifted while cleaning' })
  note!: string | null;

  @ApiProperty({ type: UserCard })
  movedBy!: UserCard;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}

/** GET /places/{placeId}/items/{itemId} */
export class ItemDetailResponse extends ItemResponse {
  @ApiProperty({ type: UserCard })
  owner!: UserCard;

  @ApiProperty({ type: UserCard })
  createdBy!: UserCard;

  @ApiProperty({ type: [ItemMovementResponse], description: '20 most recent moves' })
  movements!: ItemMovementResponse[];
}

export class PaginatedItemsResponse {
  @ApiProperty({ type: [ItemResponse] })
  data!: ItemResponse[];

  @ApiProperty({ type: PaginationMeta })
  meta!: PaginationMeta;
}

export class AttentionItemResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Paracetamol strip' })
  name!: string;

  @ApiProperty({ example: 2 })
  quantity!: number;

  @ApiProperty({ nullable: true, format: 'date-time' })
  expiresAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  storage?: { id: string; name: string } | null;

  @ApiPropertyOptional()
  place?: { id: string; name: string };
}

/** GET /items/attention — everything worth a notification, across all places. */
export class AttentionResponse {
  @ApiProperty({ type: [AttentionItemResponse], description: 'Expiring soon or already expired' })
  expiring!: AttentionItemResponse[];

  @ApiProperty({ type: [AttentionItemResponse], description: 'Warranty running out' })
  warranty!: AttentionItemResponse[];

  @ApiProperty({ type: [AttentionItemResponse], description: 'Lent out and past the due date' })
  overdue!: AttentionItemResponse[];

  @ApiProperty({ type: [AttentionItemResponse], description: 'At or below the low-stock threshold' })
  lowStock!: AttentionItemResponse[];
}
