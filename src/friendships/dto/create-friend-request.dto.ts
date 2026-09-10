import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';

export class CreateFriendRequestDto {
  @ApiPropertyOptional({ description: 'Either email or userId is required' })
  @ValidateIf((dto: CreateFriendRequestDto) => !dto.userId)
  @IsEmail()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ example: 'Hi Mummy, adding you so you can see the almirah' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  message?: string;
}
