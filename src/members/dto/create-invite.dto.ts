import { ApiPropertyOptional } from '@nestjs/swagger';
import { MemberRole } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsEmail, IsEnum, IsInt, IsOptional, IsPhoneNumber, Max, Min } from 'class-validator';

export class CreateInviteDto {
  @ApiPropertyOptional({ description: 'Who the invite is for — used to prefill and to notify' })
  @IsOptional()
  @IsEmail()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsPhoneNumber(undefined)
  phone?: string;

  @ApiPropertyOptional({ enum: MemberRole, default: MemberRole.MEMBER })
  @IsOptional()
  @IsEnum(MemberRole)
  role?: MemberRole;

  @ApiPropertyOptional({ default: 7, minimum: 1, maximum: 90 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  expiresInDays?: number;
}
