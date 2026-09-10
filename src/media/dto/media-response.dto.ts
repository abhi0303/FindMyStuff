import { ApiProperty } from '@nestjs/swagger';

export class MediaResponse {
  @ApiProperty({ format: 'uuid', description: 'Use this id when creating an item or storage' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  ownerId!: string;

  @ApiProperty({ example: 'image/jpeg' })
  mimeType!: string;

  @ApiProperty({ example: 284913 })
  sizeBytes!: number;

  @ApiProperty({ nullable: true, example: 1600 })
  width!: number | null;

  @ApiProperty({ nullable: true, example: 1200 })
  height!: number | null;

  @ApiProperty({ description: 'SHA-256 — re-uploading the same photo reuses the stored file' })
  checksum!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}
