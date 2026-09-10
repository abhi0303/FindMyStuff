import { MemberRole } from '@prisma/client';
import { hasAtLeastRole } from './types';

describe('hasAtLeastRole', () => {
  it('lets a higher role do what a lower role can', () => {
    expect(hasAtLeastRole(MemberRole.OWNER, MemberRole.MEMBER)).toBe(true);
    expect(hasAtLeastRole(MemberRole.ADMIN, MemberRole.MEMBER)).toBe(true);
    expect(hasAtLeastRole(MemberRole.MEMBER, MemberRole.VIEWER)).toBe(true);
  });

  it('blocks a lower role from a higher requirement', () => {
    expect(hasAtLeastRole(MemberRole.VIEWER, MemberRole.MEMBER)).toBe(false);
    expect(hasAtLeastRole(MemberRole.MEMBER, MemberRole.ADMIN)).toBe(false);
    expect(hasAtLeastRole(MemberRole.ADMIN, MemberRole.OWNER)).toBe(false);
  });

  it('treats a role as satisfying itself', () => {
    for (const role of Object.values(MemberRole)) {
      expect(hasAtLeastRole(role, role)).toBe(true);
    }
  });
});
