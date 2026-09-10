import { Injectable, NotFoundException } from '@nestjs/common';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

const PROFILE_FIELDS = {
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
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const { avatarBase64, ...data } = dto;
    const avatarMediaId = await this.media.createOptional(userId, avatarBase64);

    return this.prisma.user.update({
      where: { id: userId },
      data: { ...data, ...(avatarMediaId ? { avatarMediaId } : {}) },
      select: PROFILE_FIELDS,
    });
  }

  /**
   * Directory lookup for adding a friend. Exact email only — a partial-name
   * search would let anyone enumerate the user base.
   */
  async findByEmail(email: string) {
    const user = await this.prisma.user.findFirst({
      where: { email: email.trim().toLowerCase(), deletedAt: null, isActive: true },
      select: { id: true, name: true, email: true, avatarMediaId: true },
    });

    if (!user) throw new NotFoundException('No user found with that email');
    return user;
  }

  /** Soft-deletes the account and signs out every session. */
  async deactivate(userId: string) {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { isActive: false, deletedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { success: true };
  }
}
