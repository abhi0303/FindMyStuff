/**
 * Demo data so the API is explorable straight after setup.
 * Run with: npm run prisma:seed
 */
import {
  ItemStatus,
  LengthUnit,
  MemberRole,
  MemberStatus,
  PlaceType,
  PrismaClient,
  StorageType,
  Visibility,
} from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

const prisma = new PrismaClient();

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const labelCode = () => {
  const bytes = randomBytes(6);
  return `FMS-${Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join('')}`;
};

const TERMS_VERSION = process.env.TERMS_VERSION ?? '2026-09-01';

async function main() {
  const passwordHash = await argon2.hash('Password123');

  const owner = await prisma.user.upsert({
    where: { email: 'owner@findmystuff.test' },
    update: {},
    create: {
      email: 'owner@findmystuff.test',
      name: 'Shristi',
      passwordHash,
      termsVersion: TERMS_VERSION,
      termsAcceptedAt: new Date(),
    },
  });

  const family = await prisma.user.upsert({
    where: { email: 'family@findmystuff.test' },
    update: {},
    create: {
      email: 'family@findmystuff.test',
      name: 'Family Member',
      passwordHash,
      termsVersion: TERMS_VERSION,
      termsAcceptedAt: new Date(),
    },
  });

  await prisma.friendship.upsert({
    where: { requesterId_addresseeId: { requesterId: owner.id, addresseeId: family.id } },
    update: { status: 'ACCEPTED', respondedAt: new Date() },
    create: {
      requesterId: owner.id,
      addresseeId: family.id,
      status: 'ACCEPTED',
      respondedAt: new Date(),
    },
  });

  // Start from a clean demo place on every run.
  await prisma.place.deleteMany({ where: { ownerId: owner.id, name: 'Home — Demo' } });

  const place = await prisma.place.create({
    data: {
      name: 'Home — Demo',
      type: PlaceType.HOME,
      ownerId: owner.id,
      city: 'Noida',
      country: 'India',
      latitude: 28.6139,
      longitude: 77.209,
      members: {
        create: [
          {
            userId: owner.id,
            role: MemberRole.OWNER,
            status: MemberStatus.ACTIVE,
            joinedAt: new Date(),
          },
          {
            userId: family.id,
            role: MemberRole.MEMBER,
            status: MemberStatus.ACTIVE,
            joinedAt: new Date(),
          },
        ],
      },
    },
  });

  const bedroom = await prisma.storage.create({
    data: {
      placeId: place.id,
      name: 'Bedroom',
      type: StorageType.ROOM,
      path: '',
      level: 0,
      labelCode: labelCode(),
      createdById: owner.id,
      widthValue: 12,
      lengthValue: 14,
      lengthUnit: LengthUnit.INCH,
    },
  });

  const almirah = await prisma.storage.create({
    data: {
      placeId: place.id,
      parentId: bedroom.id,
      name: 'Almirah',
      type: StorageType.ALMIRAH,
      path: bedroom.id,
      level: 1,
      labelCode: labelCode(),
      createdById: owner.id,
    },
  });

  const topShelf = await prisma.storage.create({
    data: {
      placeId: place.id,
      parentId: almirah.id,
      name: 'Top shelf',
      type: StorageType.SHELF,
      path: `${bedroom.id}/${almirah.id}`,
      level: 2,
      labelCode: labelCode(),
      createdById: owner.id,
    },
  });

  const underBed = await prisma.storage.create({
    data: {
      placeId: place.id,
      parentId: bedroom.id,
      name: 'Under the bed',
      type: StorageType.BED,
      path: bedroom.id,
      level: 1,
      labelCode: labelCode(),
      createdById: owner.id,
    },
  });

  const blueBox = await prisma.storage.create({
    data: {
      placeId: place.id,
      parentId: underBed.id,
      name: 'Blue box',
      type: StorageType.BOX,
      path: `${bedroom.id}/${underBed.id}`,
      level: 2,
      labelCode: labelCode(),
      createdById: owner.id,
    },
  });

  const nextYear = new Date();
  nextYear.setFullYear(nextYear.getFullYear() + 1);

  const soon = new Date();
  soon.setDate(soon.getDate() + 12);

  await prisma.item.createMany({
    data: [
      {
        placeId: place.id,
        storageId: topShelf.id,
        name: 'Passport',
        category: 'Documents',
        tags: ['documents', 'important'],
        aliases: ['passbook'],
        description: 'Inside the brown document folder',
        visibility: Visibility.PRIVATE,
        ownerId: owner.id,
        createdById: owner.id,
        expiresAt: nextYear,
      },
      {
        placeId: place.id,
        storageId: blueBox.id,
        name: 'Type-C cable',
        category: 'Electronics',
        tags: ['electronics'],
        // The point of aliases: nobody searches for "Type-C cable".
        aliases: ['charger', 'cable', 'charging wire'],
        quantity: 3,
        lowStockAt: 1,
        ownerId: owner.id,
        createdById: owner.id,
      },
      {
        placeId: place.id,
        storageId: almirah.id,
        name: 'Winter quilt',
        category: 'Bedding',
        tags: ['seasonal'],
        ownerId: owner.id,
        createdById: owner.id,
      },
      {
        placeId: place.id,
        storageId: topShelf.id,
        name: 'Paracetamol strip',
        category: 'Medicine',
        tags: ['medicine'],
        quantity: 2,
        lowStockAt: 2,
        expiresAt: soon,
        ownerId: family.id,
        createdById: family.id,
      },
      {
        placeId: place.id,
        storageId: blueBox.id,
        name: 'Power drill',
        category: 'Tools',
        tags: ['tools'],
        status: ItemStatus.LENT_OUT,
        lentToName: 'Neighbour',
        lentAt: new Date(),
        ownerId: owner.id,
        createdById: owner.id,
      },
    ],
  });

  console.log('Seed complete.');
  console.log('  owner@findmystuff.test  / Password123  (OWNER)');
  console.log('  family@findmystuff.test / Password123  (MEMBER)');
  console.log(`  place: ${place.name} (${place.id})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
