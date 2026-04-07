-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'EMPLOYEE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TankDefinition" (
    "tankNo" TEXT NOT NULL PRIMARY KEY,
    "fuelType" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "FuelTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeNo" TEXT NOT NULL,
    "binNo" TEXT,
    "itemNo" TEXT,
    "uom" TEXT,
    "itemDesc" TEXT,
    "itemCat" TEXT,
    "qtyMin" REAL,
    "qtyMax" REAL,
    "finPeriod" TEXT,
    "transDate" DATETIME NOT NULL,
    "transType" TEXT NOT NULL,
    "transQty" REAL NOT NULL,
    "transAmt" REAL,
    "unitPrice" REAL,
    "transRefNo" TEXT,
    "transVoteNo" TEXT,
    "totOnHandQty" REAL,
    "totOnHandVal" REAL,
    "fuelType" TEXT NOT NULL,
    "isIssue" BOOLEAN NOT NULL,
    "vehicleId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DailyFuelStats" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "fuelType" TEXT NOT NULL,
    "totalVolume" REAL NOT NULL,
    "totalCost" REAL NOT NULL,
    "transactionCount" INTEGER NOT NULL,
    "averageVolume" REAL NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "FuelTransaction_transDate_idx" ON "FuelTransaction"("transDate");

-- CreateIndex
CREATE INDEX "FuelTransaction_vehicleId_idx" ON "FuelTransaction"("vehicleId");

-- CreateIndex
CREATE INDEX "FuelTransaction_fuelType_idx" ON "FuelTransaction"("fuelType");

-- CreateIndex
CREATE INDEX "FuelTransaction_transVoteNo_idx" ON "FuelTransaction"("transVoteNo");

-- CreateIndex
CREATE UNIQUE INDEX "DailyFuelStats_date_fuelType_key" ON "DailyFuelStats"("date", "fuelType");
