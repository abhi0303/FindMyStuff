import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsBoolean, IsOptional, IsString } from 'class-validator';

export class AcceptTermsDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  @Equals(true, { message: 'Terms and conditions must be accepted' })
  accept!: boolean;

  @ApiProperty({
    required: false,
    description: 'Version being accepted. Must match the current server version when provided.',
  })
  @IsOptional()
  @IsString()
  version?: string;
}
