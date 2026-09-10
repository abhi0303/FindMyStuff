-- CreateEnum
CREATE TYPE "PlaceType" AS ENUM ('HOME', 'OFFICE', 'LOCKER', 'VEHICLE', 'STORAGE_UNIT', 'OTHER');

-- CreateEnum
CREATE TYPE "StorageType" AS ENUM ('ROOM', 'ALMIRAH', 'WARDROBE', 'CABINET', 'SHELF', 'DRAWER', 'BED', 'BOX', 'SUITCASE', 'BAG', 'FRIDGE', 'LOFT', 'RACK', 'DESK', 'SAFE', 'OTHER');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('INVITED', 'ACTIVE', 'REMOVED');

-- CreateEnum
CREATE TYPE "FriendshipStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('SHARED', 'PRIVATE');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('AVAILABLE', 'LENT_OUT', 'CONSUMED', 'LOST', 'DISCARDED');

-- CreateEnum
CREATE TYPE "LengthUnit" AS ENUM ('CM', 'INCH');

-- CreateEnum
CREATE TYPE "ActivityAction" AS ENUM ('PLACE_CREATED', 'PLACE_UPDATED', 'MEMBER_INVITED', 'MEMBER_JOINED', 'MEMBER_ROLE_CHANGED', 'MEMBER_REMOVED', 'STORAGE_CREATED', 'STORAGE_UPDATED', 'STORAGE_DELETED', 'ITEM_CREATED', 'ITEM_UPDATED', 'ITEM_MOVED', 'ITEM_DELETED', 'ITEM_LENT', 'ITEM_RETURNED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "avatarMediaId" UUID,
    "termsVersion" TEXT,
    "termsAcceptedAt" TIMESTAMP(3),
    "termsAcceptedIp" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "replacedByTokenId" UUID,
    "revokedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "friendships" (
    "id" UUID NOT NULL,
    "requesterId" UUID NOT NULL,
    "addresseeId" UUID NOT NULL,
    "status" "FriendshipStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "friendships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "places" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PlaceType" NOT NULL DEFAULT 'HOME',
    "description" TEXT,
    "widthValue" DECIMAL(10,2),
    "lengthValue" DECIMAL(10,2),
    "heightValue" DECIMAL(10,2),
    "lengthUnit" "LengthUnit",
    "addressLine" TEXT,
    "city" TEXT,
    "country" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "coverMediaId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "places_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_members" (
    "id" UUID NOT NULL,
    "placeId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'MEMBER',
    "status" "MemberStatus" NOT NULL DEFAULT 'INVITED',
    "invitedById" UUID,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joinedAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "place_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_invites" (
    "id" UUID NOT NULL,
    "placeId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "role" "MemberRole" NOT NULL DEFAULT 'MEMBER',
    "createdById" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedById" UUID,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "place_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storages" (
    "id" UUID NOT NULL,
    "placeId" UUID NOT NULL,
    "parentId" UUID,
    "name" TEXT NOT NULL,
    "type" "StorageType" NOT NULL DEFAULT 'OTHER',
    "description" TEXT,
    "path" TEXT NOT NULL DEFAULT '',
    "level" INTEGER NOT NULL DEFAULT 0,
    "labelCode" TEXT NOT NULL,
    "widthValue" DECIMAL(10,2),
    "lengthValue" DECIMAL(10,2),
    "heightValue" DECIMAL(10,2),
    "lengthUnit" "LengthUnit",
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "coverMediaId" UUID,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "storages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" UUID NOT NULL,
    "placeId" UUID NOT NULL,
    "storageId" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "lowStockAt" INTEGER,
    "serialNumber" TEXT,
    "status" "ItemStatus" NOT NULL DEFAULT 'AVAILABLE',
    "visibility" "Visibility" NOT NULL DEFAULT 'SHARED',
    "ownerId" UUID NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "purchasedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "warrantyUntil" TIMESTAMP(3),
    "remindAt" TIMESTAMP(3),
    "remindedAt" TIMESTAMP(3),
    "lentToName" TEXT,
    "lentToId" UUID,
    "lentAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_movements" (
    "id" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "fromStorageId" UUID,
    "toStorageId" UUID,
    "fromLabel" TEXT,
    "toLabel" TEXT,
    "movedById" UUID NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "driver" TEXT NOT NULL DEFAULT 'local',
    "storageKey" TEXT NOT NULL,
    "thumbnailKey" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "checksum" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_media" (
    "itemId" UUID NOT NULL,
    "mediaId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_media_pkey" PRIMARY KEY ("itemId","mediaId")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" UUID NOT NULL,
    "placeId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "action" "ActivityAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID,
    "summary" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_deletedAt_idx" ON "users"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_revokedAt_idx" ON "refresh_tokens"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "refresh_tokens_expiresAt_idx" ON "refresh_tokens"("expiresAt");

-- CreateIndex
CREATE INDEX "friendships_addresseeId_status_idx" ON "friendships"("addresseeId", "status");

-- CreateIndex
CREATE INDEX "friendships_requesterId_status_idx" ON "friendships"("requesterId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "friendships_requesterId_addresseeId_key" ON "friendships"("requesterId", "addresseeId");

-- CreateIndex
CREATE INDEX "places_ownerId_deletedAt_idx" ON "places"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "place_members_userId_status_idx" ON "place_members"("userId", "status");

-- CreateIndex
CREATE INDEX "place_members_placeId_status_idx" ON "place_members"("placeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "place_members_placeId_userId_key" ON "place_members"("placeId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "place_invites_code_key" ON "place_invites"("code");

-- CreateIndex
CREATE INDEX "place_invites_placeId_acceptedAt_idx" ON "place_invites"("placeId", "acceptedAt");

-- CreateIndex
CREATE INDEX "place_invites_email_idx" ON "place_invites"("email");

-- CreateIndex
CREATE UNIQUE INDEX "storages_labelCode_key" ON "storages"("labelCode");

-- CreateIndex
CREATE INDEX "storages_placeId_deletedAt_idx" ON "storages"("placeId", "deletedAt");

-- CreateIndex
CREATE INDEX "storages_parentId_idx" ON "storages"("parentId");

-- CreateIndex
CREATE INDEX "storages_placeId_path_idx" ON "storages"("placeId", "path");

-- CreateIndex
CREATE INDEX "items_placeId_deletedAt_idx" ON "items"("placeId", "deletedAt");

-- CreateIndex
CREATE INDEX "items_storageId_idx" ON "items"("storageId");

-- CreateIndex
CREATE INDEX "items_placeId_status_idx" ON "items"("placeId", "status");

-- CreateIndex
CREATE INDEX "items_expiresAt_idx" ON "items"("expiresAt");

-- CreateIndex
CREATE INDEX "items_remindAt_idx" ON "items"("remindAt");

-- CreateIndex
CREATE INDEX "items_ownerId_idx" ON "items"("ownerId");

-- CreateIndex
CREATE INDEX "item_movements_itemId_createdAt_idx" ON "item_movements"("itemId", "createdAt");

-- CreateIndex
CREATE INDEX "media_ownerId_deletedAt_idx" ON "media"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "media_checksum_idx" ON "media"("checksum");

-- CreateIndex
CREATE INDEX "item_media_mediaId_idx" ON "item_media"("mediaId");

-- CreateIndex
CREATE INDEX "activity_logs_placeId_createdAt_idx" ON "activity_logs"("placeId", "createdAt");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_avatarMediaId_fkey" FOREIGN KEY ("avatarMediaId") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_addresseeId_fkey" FOREIGN KEY ("addresseeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "places" ADD CONSTRAINT "places_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "places" ADD CONSTRAINT "places_coverMediaId_fkey" FOREIGN KEY ("coverMediaId") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_members" ADD CONSTRAINT "place_members_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_members" ADD CONSTRAINT "place_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_members" ADD CONSTRAINT "place_members_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_invites" ADD CONSTRAINT "place_invites_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_invites" ADD CONSTRAINT "place_invites_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_invites" ADD CONSTRAINT "place_invites_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storages" ADD CONSTRAINT "storages_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storages" ADD CONSTRAINT "storages_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "storages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storages" ADD CONSTRAINT "storages_coverMediaId_fkey" FOREIGN KEY ("coverMediaId") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storages" ADD CONSTRAINT "storages_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_storageId_fkey" FOREIGN KEY ("storageId") REFERENCES "storages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_movements" ADD CONSTRAINT "item_movements_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_movements" ADD CONSTRAINT "item_movements_fromStorageId_fkey" FOREIGN KEY ("fromStorageId") REFERENCES "storages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_movements" ADD CONSTRAINT "item_movements_toStorageId_fkey" FOREIGN KEY ("toStorageId") REFERENCES "storages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_movements" ADD CONSTRAINT "item_movements_movedById_fkey" FOREIGN KEY ("movedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_media" ADD CONSTRAINT "item_media_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_media" ADD CONSTRAINT "item_media_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
