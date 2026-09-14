-- CreateIndex
CREATE INDEX "items_placeId_updatedAt_idx" ON "items"("placeId", "updatedAt");

-- CreateIndex
CREATE INDEX "places_updatedAt_idx" ON "places"("updatedAt");

-- CreateIndex
CREATE INDEX "storages_placeId_updatedAt_idx" ON "storages"("placeId", "updatedAt");
