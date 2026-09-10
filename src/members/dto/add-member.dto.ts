import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MemberRole } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export class AddMemberDto {
  @ApiProperty({ description: 'Must already be an accepted friend' })
  @IsUUID()
  userId!: string;

  @ApiPropertyOptional({ enum: MemberRole, default: MemberRole.MEMBER })
  @IsOptional()
  @IsEnum(MemberRole)
  role?: MemberRole;
}
