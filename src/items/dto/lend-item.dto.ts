import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class LendItemDto {
  @ApiProperty({ example: 'Rahul (neighbour)' })
  @IsString()
  @MaxLength(120)
  lentToName!: string;

  @ApiPropertyOptional({ description: 'App user id, when you lent it to someone on FindMyStuff' })
  @IsOptional()
  @IsUUID()
  lentToId?: string;

  @ApiPropertyOptional({ description: 'When you expect it back' })
  @IsOptional()
  @IsDateString()
  dueAt?: string;
}
