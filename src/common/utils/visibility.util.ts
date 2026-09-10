import { Prisma, Visibility } from '@prisma/client';

/**
 * Items marked PRIVATE stay invisible to every other member of a shared place,
 * including the place owner. Applied to every item read path.
 */
export const visibilityFilter = (userId: string): Prisma.ItemWhereInput => ({
  OR: [{ visibility: Visibility.SHARED }, { visibility: Visibility.PRIVATE, ownerId: userId }],
});
