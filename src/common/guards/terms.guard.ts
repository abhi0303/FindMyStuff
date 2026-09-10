import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SKIP_TERMS_KEY } from '../decorators/skip-terms.decorator';
import { AuthenticatedRequest } from '../types';

/**
 * Blocks authenticated routes until the user has accepted the *current* terms
 * version. Bumping TERMS_VERSION re-prompts everyone without a migration.
 */
@Injectable()
export class TermsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_TERMS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skip || isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) return true;

    const currentVersion = this.config.get<string>('termsVersion');

    if (request.user.termsVersion !== currentVersion) {
      throw new ForbiddenException({
        message: 'Updated terms and conditions must be accepted to continue.',
        code: 'TERMS_ACCEPTANCE_REQUIRED',
        requiredTermsVersion: currentVersion,
      });
    }

    return true;
  }
}
