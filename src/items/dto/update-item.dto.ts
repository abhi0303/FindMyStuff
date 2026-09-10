import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { CreateItemDto } from './create-item.dto';

export class UpdateItemDto extends PartialType(OmitType(CreateItemDto, ['storageId'])) {
  @ApiPropertyOptional({
    description: 'Move the item. Pass null to mark it as not put away anywhere.',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsUUID()
  storageId?: string | null;
}
