import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

export class AcceptInviteDto {
  @ApiProperty({ example: 'FMS-INV-7K3QX2' })
  @IsString()
  @Length(6, 40)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  code!: string;
}
