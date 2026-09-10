import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { SignOptions } from 'jsonwebtoken';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

interface RefreshTokenPayload {
  sub: string;
  jti: string;
}

interface RequestContext {
  userAgent?: string;
  ip?: string;
}

@Injectable()
export class TokensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** Refresh tokens are stored hashed — a DB dump cannot be replayed as sessions. */
  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async issue(
    user: { id: string; email: string },
    context: RequestContext = {},
    replacesTokenId?: string,
  ): Promise<TokenPair> {
    // jsonwebtoken types expiresIn as a template-literal duration ("15m"),
    // which a plain env string cannot satisfy without this cast.
    const accessTtl = this.config.getOrThrow<string>('jwt.accessTtl') as SignOptions['expiresIn'];
    const refreshTtl = this.config.getOrThrow<string>('jwt.refreshTtl') as SignOptions['expiresIn'];
    const jti = randomUUID();

    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email },
      { secret: this.config.getOrThrow<string>('jwt.accessSecret'), expiresIn: accessTtl },
    );

    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, jti } satisfies RefreshTokenPayload,
      { secret: this.config.getOrThrow<string>('jwt.refreshSecret'), expiresIn: refreshTtl },
    );

    const decoded = this.jwt.decode(refreshToken) as { exp: number };

    const stored = await this.prisma.refreshToken.create({
      data: {
        id: jti,
        userId: user.id,
        tokenHash: this.hash(refreshToken),
        expiresAt: new Date(decoded.exp * 1000),
        userAgent: context.userAgent?.slice(0, 255),
        ip: context.ip,
      },
    });

    if (replacesTokenId) {
      await this.prisma.refreshToken.update({
        where: { id: replacesTokenId },
        data: { revokedAt: new Date(), replacedByTokenId: stored.id },
      });
    }

    return { accessToken, refreshToken, expiresIn: String(accessTtl) };
  }

  /**
   * Rotates a refresh token. Presenting a token that was already rotated means
   * it leaked, so every session for that user is revoked rather than just this
   * one.
   */
  async rotate(refreshToken: string, context: RequestContext = {}): Promise<TokenPair> {
    let payload: RefreshTokenPayload;

    try {
      payload = await this.jwt.verifyAsync<RefreshTokenPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const stored = await this.prisma.refreshToken.findUnique({
      where: { id: payload.jti },
    });

    if (!stored || stored.tokenHash !== this.hash(refreshToken)) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (stored.revokedAt) {
      await this.revokeAllForUser(stored.userId);
      throw new UnauthorizedException(
        'Refresh token has already been used. All sessions have been signed out.',
      );
    }

    if (stored.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: stored.userId, deletedAt: null, isActive: true },
      select: { id: true, email: true },
    });

    if (!user) {
      throw new UnauthorizedException('Account is no longer active');
    }

    return this.issue(user, context, stored.id);
  }

  async revoke(refreshToken: string): Promise<void> {
    const hash = this.hash(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
