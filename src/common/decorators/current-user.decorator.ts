import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { AuthUser, AuthenticatedRequest } from '../types';

export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return data ? request.user?.[data] : request.user;
  },
);
