import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class SyncQueryDto {
  @ApiPropertyOptional({
    description:
      'Only return changes after this server timestamp. Always use the ' +
      '`serverTime` value from the PREVIOUS sync response here — never the ' +
      "device's own clock, which can drift. Omit entirely for the first, " +
      'full sync.',
    example: '2026-09-14T12:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  since?: string;

  @ApiPropertyOptional({ description: 'Narrow the sync to one place. Omit for every place you can see.' })
  @IsOptional()
  @IsUUID()
  placeId?: string;
}
