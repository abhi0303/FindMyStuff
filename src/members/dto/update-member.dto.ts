import { ApiProperty } from '@nestjs/swagger';
import { MemberRole } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateMemberDto {
  @ApiProperty({ enum: MemberRole })
  @IsEnum(MemberRole)
  role!: MemberRole;
}
