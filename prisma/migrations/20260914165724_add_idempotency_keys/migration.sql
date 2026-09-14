-- CreateEnum
CREATE TYPE "IdempotencyKeyStatus" AS ENUM ('PENDING', 'COMPLETED');

-- DropIndex
DROP INDEX "items_aliases_idx";

-- DropIndex
DROP INDEX "items_name_trgm_idx";

-- DropIndex
DROP INDEX "items_tags_idx";

-- DropIndex
DROP INDEX "storages_name_trgm_idx";

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "requestBodyHash" TEXT NOT NULL,
    "status" "IdempotencyKeyStatus" NOT NULL DEFAULT 'PENDING',
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idempotency_keys_expiresAt_idx" ON "idempotency_keys"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_userId_key_key" ON "idempotency_keys"("userId", "key");

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
