import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { CreateStorageDto } from './create-storage.dto';

export class UpdateStorageDto extends PartialType(OmitType(CreateStorageDto, ['parentId'])) {
  @ApiPropertyOptional({
    description:
      'Move this storage (and everything inside it) under another storage. Pass null to move it to the top level.',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsUUID()
  parentId?: string | null;
}
