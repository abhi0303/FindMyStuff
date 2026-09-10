import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActivityAction, MemberRole, MemberStatus } from '@prisma/client';
import { ActivityService } from '../activity/activity.service';
import { generateLabelCode } from '../common/utils/label-code.util';
import { FriendshipsService } from '../friendships/friendships.service';
import { PrismaService } from '../prisma/prisma.service';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { CreateInviteDto } from './dto/create-invite.dto';
import { UpdateMemberDto } from './dto/update-member.dto';

const USER_CARD = {
  id: true,
  name: true,
  email: true,
  avatarMediaId: true,
} as const;

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly friendships: FriendshipsService,
    private readonly activity: ActivityService,
  ) {}

  list(placeId: string) {
    return this.prisma.placeMember.findMany({
      where: { placeId, status: { not: MemberStatus.REMOVED } },
      include: { user: { select: USER_CARD }, invitedBy: { select: USER_CARD } },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    });
  }

  /**
   * Adding someone directly requires an accepted friendship — that is the
   * "friends first, then family" rule. Use an invite code for people who are
   * not on the app yet.
   */
  async add(actorId: string, placeId: string, dto: AddMemberDto) {
    if (dto.userId === actorId) {
      throw new BadRequestException('You are already a member of this place');
    }

    if (dto.role === MemberRole.OWNER) {
      throw new BadRequestException('A place can only have one owner');
    }

    if (!(await this.friendships.areFriends(actorId, dto.userId))) {
      throw new ForbiddenException(
        'You can only add someone who has accepted your friend request. Send an invite code instead.',
      );
    }

    const user = await this.prisma.user.findFirst({
      where: { id: dto.userId, deletedAt: null, isActive: true },
      select: USER_CARD,
    });

    if (!user) throw new NotFoundException('User not found');

    const existing = await this.prisma.placeMember.findUnique({
      where: { placeId_userId: { placeId, userId: dto.userId } },
    });

    if (existing && existing.status === MemberStatus.ACTIVE) {
      throw new BadRequestException(`${user.name} is already in this place`);
    }

    const member = await this.prisma.placeMember.upsert({
      where: { placeId_userId: { placeId, userId: dto.userId } },
      create: {
        placeId,
        userId: dto.userId,
        role: dto.role ?? MemberRole.MEMBER,
        // A friend added by the owner joins immediately — the friendship
        // handshake already served as the consent step.
        status: MemberStatus.ACTIVE,
        invitedById: actorId,
        joinedAt: new Date(),
      },
      update: {
        role: dto.role ?? MemberRole.MEMBER,
        status: MemberStatus.ACTIVE,
        invitedById: actorId,
        joinedAt: new Date(),
        removedAt: null,
      },
      include: { user: { select: USER_CARD } },
    });

    await this.activity.log({
      placeId,
      actorId,
      action: ActivityAction.MEMBER_JOINED,
      entityType: 'PlaceMember',
      entityId: member.id,
      summary: `${user.name} joined as ${member.role}`,
    });

    return member;
  }

  async updateRole(actorId: string, placeId: string, memberId: string, dto: UpdateMemberDto) {
    const member = await this.prisma.placeMember.findFirst({
      where: { id: memberId, placeId },
      include: { user: { select: USER_CARD } },
    });

    if (!member) throw new NotFoundException('Member not found');
    if (member.role === MemberRole.OWNER) {
      throw new BadRequestException("The owner's role cannot be changed");
    }
    if (dto.role === MemberRole.OWNER) {
      throw new BadRequestException('Ownership transfer is not supported yet');
    }

    const updated = await this.prisma.placeMember.update({
      where: { id: memberId },
      data: { role: dto.role },
      include: { user: { select: USER_CARD } },
    });

    await this.activity.log({
      placeId,
      actorId,
      action: ActivityAction.MEMBER_ROLE_CHANGED,
      entityType: 'PlaceMember',
      entityId: memberId,
      summary: `${member.user.name} is now ${dto.role}`,
    });

    return updated;
  }

  async remove(actorId: string, placeId: string, memberId: string) {
    const member = await this.prisma.placeMember.findFirst({
      where: { id: memberId, placeId },
      include: { user: { select: USER_CARD } },
    });

    if (!member) throw new NotFoundException('Member not found');
    if (member.role === MemberRole.OWNER) {
      throw new BadRequestException('The owner cannot be removed from their own place');
    }

    await this.prisma.placeMember.update({
      where: { id: memberId },
      data: { status: MemberStatus.REMOVED, removedAt: new Date() },
    });

    await this.activity.log({
      placeId,
      actorId,
      action: ActivityAction.MEMBER_REMOVED,
      entityType: 'PlaceMember',
      entityId: memberId,
      summary: `${member.user.name} was removed`,
    });

    return { success: true };
  }

  async leave(userId: string, placeId: string) {
    const member = await this.prisma.placeMember.findUnique({
      where: { placeId_userId: { placeId, userId } },
    });

    if (!member || member.status !== MemberStatus.ACTIVE) {
      throw new NotFoundException('You are not a member of this place');
    }
    if (member.role === MemberRole.OWNER) {
      throw new BadRequestException('The owner cannot leave. Delete the place instead.');
    }

    await this.prisma.placeMember.update({
      where: { id: member.id },
      data: { status: MemberStatus.REMOVED, removedAt: new Date() },
    });

    return { success: true };
  }

  // -------------------------------------------------------------------------
  // Invite codes — for people who are not on the app yet
  // -------------------------------------------------------------------------

  async createInvite(actorId: string, placeId: string, dto: CreateInviteDto) {
    if (dto.role === MemberRole.OWNER) {
      throw new BadRequestException('A place can only have one owner');
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (dto.expiresInDays ?? 7));

    const invite = await this.prisma.placeInvite.create({
      data: {
        placeId,
        code: `INV-${generateLabelCode(8).replace('FMS-', '')}`,
        email: dto.email,
        phone: dto.phone,
        role: dto.role ?? MemberRole.MEMBER,
        createdById: actorId,
        expiresAt,
      },
    });

    await this.activity.log({
      placeId,
      actorId,
      action: ActivityAction.MEMBER_INVITED,
      entityType: 'PlaceInvite',
      entityId: invite.id,
      summary: `Invited ${dto.email ?? dto.phone ?? 'someone'} as ${invite.role}`,
    });

    return invite;
  }

  listInvites(placeId: string) {
    return this.prisma.placeInvite.findMany({
      where: { placeId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      include: { createdBy: { select: USER_CARD } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeInvite(placeId: string, inviteId: string) {
    const result = await this.prisma.placeInvite.updateMany({
      where: { id: inviteId, placeId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (result.count === 0) throw new NotFoundException('Invite not found');
    return { success: true };
  }

  /** Redeeming a code is what turns an invited person into a member. */
  async acceptInvite(userId: string, dto: AcceptInviteDto) {
    const invite = await this.prisma.placeInvite.findUnique({
      where: { code: dto.code },
      include: { place: { select: { id: true, name: true, deletedAt: true } } },
    });

    if (!invite || invite.revokedAt || invite.place.deletedAt) {
      throw new NotFoundException('This invite is no longer valid');
    }
    if (invite.acceptedAt) {
      throw new BadRequestException('This invite has already been used');
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('This invite has expired');
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { ...USER_CARD, email: true },
    });

    // When an invite was addressed to a specific email, only that account can
    // redeem it — otherwise a leaked code would let anyone in.
    if (invite.email && invite.email !== user.email) {
      throw new ForbiddenException('This invite was issued to a different email address');
    }

    const member = await this.prisma.$transaction(async (tx) => {
      const created = await tx.placeMember.upsert({
        where: { placeId_userId: { placeId: invite.placeId, userId } },
        create: {
          placeId: invite.placeId,
          userId,
          role: invite.role,
          status: MemberStatus.ACTIVE,
          invitedById: invite.createdById,
          joinedAt: new Date(),
        },
        update: {
          role: invite.role,
          status: MemberStatus.ACTIVE,
          joinedAt: new Date(),
          removedAt: null,
        },
      });

      await tx.placeInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date(), acceptedById: userId },
      });

      return created;
    });

    await this.activity.log({
      placeId: invite.placeId,
      actorId: userId,
      action: ActivityAction.MEMBER_JOINED,
      entityType: 'PlaceMember',
      entityId: member.id,
      summary: `${user.name} joined via invite as ${member.role}`,
    });

    return { ...member, place: { id: invite.place.id, name: invite.place.name } };
  }
}
