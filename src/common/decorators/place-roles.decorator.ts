import { SetMetadata } from '@nestjs/common';
import { MemberRole } from '@prisma/client';

export const PLACE_ROLE_KEY = 'placeMinRole';

/**
 * Minimum role required on the place resolved by PlaceMemberGuard.
 * Defaults to VIEWER (any active member) when not specified.
 */
export const PlaceRoles = (minRole: MemberRole) => SetMetadata(PLACE_ROLE_KEY, minRole);
