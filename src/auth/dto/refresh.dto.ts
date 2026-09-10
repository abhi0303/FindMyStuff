import { ApiProperty } from '@nestjs/swagger';
import { IsJWT } from 'class-validator';

export class RefreshDto {
  @ApiProperty({ description: 'The refresh token issued at login or last refresh' })
  @IsJWT()
  refreshToken!: string;
}
