import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { AcceptTermsDto } from './dto/accept-terms.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { TokensService } from './tokens.service';

interface RequestContext {
  userAgent?: string;
  ip?: string;
}

const PUBLIC_USER_FIELDS = {
  id: true,
  email: true,
  name: true,
  phone: true,
  avatarMediaId: true,
  termsVersion: true,
  termsAcceptedAt: true,
  createdAt: true,
} as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
    private readonly config: ConfigService,
  ) {}

  private get termsVersion(): string {
    return this.config.getOrThrow<string>('termsVersion');
  }

  async signup(dto: SignupDto, context: RequestContext) {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, ...(dto.phone ? [{ phone: dto.phone }] : [])] },
      select: { id: true, email: true },
    });

    if (existing) {
      throw new ConflictException('An account with these details already exists');
    }

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        phone: dto.phone,
        passwordHash: await argon2.hash(dto.password),
        termsVersion: this.termsVersion,
        termsAcceptedAt: new Date(),
        termsAcceptedIp: context.ip,
        lastLoginAt: new Date(),
      },
      select: PUBLIC_USER_FIELDS,
    });

    const tokens = await this.tokens.issue(user, context);
    return { user, ...tokens };
  }

  async login(dto: LoginDto, context: RequestContext) {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, deletedAt: null },
      select: { ...PUBLIC_USER_FIELDS, passwordHash: true, isActive: true },
    });

    // Verify against a dummy hash when the user is missing so that response
    // timing does not reveal whether an email is registered.
    const passwordHash =
      user?.passwordHash ??
      '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHR2YWx1ZQ$0000000000000000000000000000000000000000000';

    let valid = false;
    try {
      valid = await argon2.verify(passwordHash, dto.password);
    } catch {
      valid = false;
    }

    if (!user || !valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const { passwordHash: _hash, isActive: _active, ...safeUser } = user;
    const tokens = await this.tokens.issue(safeUser, context);

    return {
      user: safeUser,
      ...tokens,
      termsAcceptanceRequired: safeUser.termsVersion !== this.termsVersion,
      currentTermsVersion: this.termsVersion,
    };
  }

  refresh(refreshToken: string, context: RequestContext) {
    return this.tokens.rotate(refreshToken, context);
  }

  async logout(refreshToken: string) {
    await this.tokens.revoke(refreshToken);
    return { success: true };
  }

  async logoutAll(userId: string) {
    await this.tokens.revokeAllForUser(userId);
    return { success: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: PUBLIC_USER_FIELDS,
    });

    return {
      ...user,
      termsAcceptanceRequired: user.termsVersion !== this.termsVersion,
      currentTermsVersion: this.termsVersion,
    };
  }

  async acceptTerms(userId: string, dto: AcceptTermsDto, context: RequestContext) {
    if (dto.version && dto.version !== this.termsVersion) {
      throw new BadRequestException(
        `Terms version mismatch. The current version is ${this.termsVersion}.`,
      );
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        termsVersion: this.termsVersion,
        termsAcceptedAt: new Date(),
        termsAcceptedIp: context.ip,
      },
      select: PUBLIC_USER_FIELDS,
    });
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });

    if (!(await argon2.verify(user.passwordHash, dto.currentPassword))) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await argon2.hash(dto.newPassword) },
    });

    // A password change invalidates every existing session.
    await this.tokens.revokeAllForUser(userId);

    return { success: true, message: 'Password changed. Please sign in again.' };
  }
}
