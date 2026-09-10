import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';

export class MoveItemDto {
  @ApiProperty({ nullable: true, description: 'Destination storage, or null to unassign' })
  @ValidateIf((_object, value) => value !== null)
  @IsUUID()
  toStorageId!: string | null;

  @ApiPropertyOptional({ example: 'Shifted while cleaning' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
