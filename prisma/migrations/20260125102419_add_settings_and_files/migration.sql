/*
  Warnings:

  - You are about to drop the column `binNo` on the `FuelTransaction` table. All the data in the column will be lost.
  - You are about to drop the column `finPeriod` on the `FuelTransaction` table. All the data in the column will be lost.
  - You are about to drop the column `itemDesc` on the `FuelTransaction` table. All the data in the column will be lost.
  - You are about to drop the column `itemNo` on the `FuelTransaction` table. All the data in the column will be lost.
  - You are about to drop the column `qtyMax` on the `FuelTransaction` table. All the data in the column will be lost.
  - You are about to drop the column `qtyMin` on the `FuelTransaction` table. All the data in the column will be lost.
  - You are about to drop the column `totOnHandQty` on the `FuelTransaction` table. All the data in the column will be lost.
  - You are about to drop the column `totOnHandVal` on the `FuelTransaction` table. All the data in the column will be lost.
  - You are about to drop the column `unitPrice` on the `FuelTransaction` table. All the data in the column will be lost.
  - You are about to drop the column `uom` on the `FuelTransaction` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "SystemSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'global',
    "currencyCode" TEXT NOT NULL DEFAULT 'NAD',
    "currencySymbol" TEXT NOT NULL DEFAULT 'N$',
    "fuelRate" REAL NOT NULL DEFAULT 19.95,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UploadedFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FuelTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeNo" TEXT NOT NULL,
    "pumpNo" TEXT,
    "transDate" DATETIME NOT NULL,
    "transRefNo" TEXT,
    "issueTime" TEXT,
    "transVoteNo" TEXT,
    "transQty" REAL NOT NULL,
    "transAmt" REAL,
    "vehicleId" TEXT,
    "fleetUnit" TEXT,
    "fleetEI" TEXT,
    "fleetReading" TEXT,
    "jobNo" TEXT,
    "activity" TEXT,
    "itemCat" TEXT,
    "transType" TEXT,
    "fuelType" TEXT NOT NULL,
    "isIssue" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_FuelTransaction" ("createdAt", "fuelType", "id", "isIssue", "itemCat", "storeNo", "transAmt", "transDate", "transQty", "transRefNo", "transType", "transVoteNo", "vehicleId") SELECT "createdAt", "fuelType", "id", "isIssue", "itemCat", "storeNo", "transAmt", "transDate", "transQty", "transRefNo", "transType", "transVoteNo", "vehicleId" FROM "FuelTransaction";
DROP TABLE "FuelTransaction";
ALTER TABLE "new_FuelTransaction" RENAME TO "FuelTransaction";
CREATE INDEX "FuelTransaction_transDate_idx" ON "FuelTransaction"("transDate");
CREATE INDEX "FuelTransaction_vehicleId_idx" ON "FuelTransaction"("vehicleId");
CREATE INDEX "FuelTransaction_fuelType_idx" ON "FuelTransaction"("fuelType");
CREATE INDEX "FuelTransaction_transVoteNo_idx" ON "FuelTransaction"("transVoteNo");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
