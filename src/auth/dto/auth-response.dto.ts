import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserProfileResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'shristi@example.com' })
  email!: string;

  @ApiProperty({ example: 'Shristi Gupta' })
  name!: string;

  @ApiProperty({ nullable: true, example: '+919876543210' })
  phone!: string | null;

  @ApiProperty({ nullable: true, format: 'uuid' })
  avatarMediaId!: string | null;

  @ApiProperty({ nullable: true, example: '2026-09-01' })
  termsVersion!: string | null;

  @ApiProperty({ nullable: true, format: 'date-time' })
  termsAcceptedAt!: Date | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}

/** /auth/me — adds whether a newer terms version needs accepting. */
export class MeResponse extends UserProfileResponse {
  @ApiProperty({
    example: false,
    description: 'When true, show the terms dialog — other routes will return 403 until accepted',
  })
  termsAcceptanceRequired!: boolean;

  @ApiProperty({ example: '2026-09-01' })
  currentTermsVersion!: string;
}

export class TokenPairResponse {
  @ApiProperty({ description: 'Send as: Authorization: Bearer <accessToken>' })
  accessToken!: string;

  @ApiProperty({ description: 'Single use — every refresh returns a new one' })
  refreshToken!: string;

  @ApiProperty({ example: '15m', description: 'Lifetime of the access token' })
  expiresIn!: string;
}

export class SignupResponse extends TokenPairResponse {
  @ApiProperty({ type: UserProfileResponse })
  user!: UserProfileResponse;
}

export class LoginResponse extends SignupResponse {
  @ApiProperty({ example: false })
  termsAcceptanceRequired!: boolean;

  @ApiProperty({ example: '2026-09-01' })
  currentTermsVersion!: string;
}

export class ChangePasswordResponse {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiPropertyOptional({ example: 'Password changed. Please sign in again.' })
  message?: string;
}
