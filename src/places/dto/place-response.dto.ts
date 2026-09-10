import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MemberRole, MemberStatus, PlaceType } from '@prisma/client';
import { UserCard } from '../../common/dto/response.dto';

export class PlaceResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Home — Sector 62' })
  name!: string;

  @ApiProperty({ enum: PlaceType })
  type!: PlaceType;

  @ApiProperty({ nullable: true })
  description!: string | null;

  @ApiProperty({ format: 'uuid' })
  ownerId!: string;

  @ApiProperty({ nullable: true, example: 'Noida' })
  city!: string | null;

  @ApiProperty({ nullable: true, example: 'India' })
  country!: string | null;

  @ApiProperty({ nullable: true, example: 28.6139 })
  latitude!: number | null;

  @ApiProperty({ nullable: true, example: 77.209 })
  longitude!: number | null;

  @ApiProperty({ nullable: true, format: 'uuid' })
  coverMediaId!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}

/** GET /places — one card per place you can see. */
export class PlaceListItemResponse extends PlaceResponse {
  @ApiProperty({ enum: MemberRole, description: 'Your role in this place' })
  myRole!: MemberRole;

  @ApiProperty({ example: 2 })
  memberCount!: number;

  @ApiProperty({ type: [UserCard] })
  members!: UserCard[];

  @ApiProperty({ example: 5 })
  storageCount!: number;

  @ApiProperty({ example: 12, description: 'Excludes other people\'s private items' })
  itemCount!: number;
}

export class PlaceMemberResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: MemberRole })
  role!: MemberRole;

  @ApiProperty({ enum: MemberStatus })
  status!: MemberStatus;

  @ApiProperty({ nullable: true, format: 'date-time' })
  joinedAt!: Date | null;

  @ApiProperty({ type: UserCard })
  user!: UserCard;

  @ApiPropertyOptional({ type: UserCard, nullable: true })
  invitedBy?: UserCard | null;
}

/** GET /places/{placeId} */
export class PlaceDetailResponse extends PlaceResponse {
  @ApiProperty({ type: UserCard })
  owner!: UserCard;

  @ApiProperty({ type: [PlaceMemberResponse] })
  members!: PlaceMemberResponse[];

  @ApiProperty({ enum: MemberRole })
  myRole!: MemberRole;

  @ApiProperty({ example: 5 })
  storageCount!: number;

  @ApiProperty({ example: 12 })
  itemCount!: number;
}

export class PlaceInviteResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'INV-ZJ5Y0YAP', description: 'Share this code with the person' })
  code!: string;

  @ApiProperty({ nullable: true, example: 'mum@example.com' })
  email!: string | null;

  @ApiProperty({ nullable: true })
  phone!: string | null;

  @ApiProperty({ enum: MemberRole })
  role!: MemberRole;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: Date;

  @ApiProperty({ nullable: true, format: 'date-time' })
  acceptedAt!: Date | null;
}

export class ActivityLogResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'ITEM_MOVED' })
  action!: string;

  @ApiProperty({ example: 'Item' })
  entityType!: string;

  @ApiProperty({ nullable: true, format: 'uuid' })
  entityId!: string | null;

  @ApiProperty({ example: 'Moved "Passport" to Bedroom › Almirah › Top shelf' })
  summary!: string;

  @ApiProperty({ type: UserCard })
  actor!: UserCard;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}
