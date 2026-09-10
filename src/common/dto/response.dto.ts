import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Response shapes exist for documentation: they describe what the services
 * actually return, so the OpenAPI spec tells a client developer the JSON shape
 * rather than just the request body.
 */

export class SuccessResponse {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiPropertyOptional({ example: 'Home — Demo deleted' })
  message?: string;
}

export class PaginationMeta {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 37 })
  total!: number;

  @ApiProperty({ example: 2 })
  totalPages!: number;

  @ApiProperty({ example: true })
  hasNext!: boolean;
}

export class UserCard {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Shristi' })
  name!: string;

  @ApiPropertyOptional({ example: 'shristi@example.com' })
  email?: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  avatarMediaId?: string | null;
}

export class PlaceCard {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Home — Sector 62' })
  name!: string;
}
