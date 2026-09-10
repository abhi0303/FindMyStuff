import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateMediaDto {
  @ApiProperty({
    description:
      'Image as base64. A data URI ("data:image/jpeg;base64,...") or raw base64 both work.',
  })
  @IsString()
  base64!: string;

  @ApiPropertyOptional({ description: 'Optional caption/filename, stored for reference only' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;
}
