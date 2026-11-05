-- Backfilled into the migration history: FuelDelivery and the SystemSettings
-- price columns were both created with `prisma db push`, so the history had
-- drifted from the schema and a fresh deploy would not have produced them.
--
-- On an existing database these objects are already present, so this migration
-- is marked applied with `prisma migrate resolve --applied` rather than run.

-- CreateTable
CREATE TABLE "FuelDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderNo" TEXT NOT NULL,
    "orderDate" DATETIME NOT NULL,
    "suppRef" TEXT,
    "suppName" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "itemDesc" TEXT NOT NULL,
    "fuelType" TEXT NOT NULL,
    "orderQty" REAL NOT NULL,
    "orderCost" REAL NOT NULL,
    "grnQty" REAL NOT NULL,
    "grnCost" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SystemSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'global',
    "currencyCode" TEXT NOT NULL DEFAULT 'NAD',
    "currencySymbol" TEXT NOT NULL DEFAULT 'N$',
    "petrolPrice" REAL NOT NULL DEFAULT 0,
    "dieselPrice" REAL NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_SystemSettings" ("currencyCode", "currencySymbol", "id", "updatedAt") SELECT "currencyCode", "currencySymbol", "id", "updatedAt" FROM "SystemSettings";
DROP TABLE "SystemSettings";
ALTER TABLE "new_SystemSettings" RENAME TO "SystemSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "FuelDelivery_orderDate_idx" ON "FuelDelivery"("orderDate");

-- CreateIndex
CREATE INDEX "FuelDelivery_fuelType_idx" ON "FuelDelivery"("fuelType");

-- CreateIndex
CREATE UNIQUE INDEX "FuelDelivery_orderNo_itemCode_key" ON "FuelDelivery"("orderNo", "itemCode");

