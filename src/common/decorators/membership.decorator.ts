import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { AuthenticatedRequest } from '../types';

/** The verified PlaceMember row attached by PlaceMemberGuard. */
export const Membership = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AuthenticatedRequest>().placeMembership;
});
