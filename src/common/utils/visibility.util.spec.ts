import { visibilityFilter } from './visibility.util';

describe('visibilityFilter', () => {
  it("matches shared items and the caller's own private items only", () => {
    const filter = visibilityFilter('user-1');

    expect(filter).toEqual({
      OR: [{ visibility: 'SHARED' }, { visibility: 'PRIVATE', ownerId: 'user-1' }],
    });
  });

  it('scopes private items to the given user, not to anyone else', () => {
    const filter = visibilityFilter('user-2');
    const privateClause = filter.OR?.[1] as { ownerId: string };

    expect(privateClause.ownerId).toBe('user-2');
  });
});
