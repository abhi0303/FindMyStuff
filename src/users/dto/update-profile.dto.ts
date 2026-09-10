import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsPhoneNumber, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsPhoneNumber(undefined)
  phone?: string;

  @ApiPropertyOptional({ description: 'Base64 avatar image' })
  @IsOptional()
  @IsString()
  avatarBase64?: string;
}
