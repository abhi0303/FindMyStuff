import { MemberRole, PlaceMember } from '@prisma/client';
import { Request } from 'express';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  termsVersion: string | null;
}

export interface AuthenticatedRequest extends Request {
  user: AuthUser;
  /** Set by PlaceMemberGuard once membership has been verified. */
  placeMembership?: PlaceMember;
}

/** Higher number = more power. Used for "at least this role" checks. */
export const ROLE_RANK: Record<MemberRole, number> = {
  VIEWER: 0,
  MEMBER: 1,
  ADMIN: 2,
  OWNER: 3,
};

export const hasAtLeastRole = (actual: MemberRole, required: MemberRole): boolean =>
  ROLE_RANK[actual] >= ROLE_RANK[required];
