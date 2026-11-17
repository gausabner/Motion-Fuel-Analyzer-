-- CreateTable
CREATE TABLE "OilTransaction" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadId" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "OilTransaction_transDate_transRefNo_vehicleId_issueTime_key" ON "OilTransaction"("transDate", "transRefNo", "vehicleId", "issueTime");

-- CreateIndex
CREATE INDEX "OilTransaction_uploadId_idx" ON "OilTransaction"("uploadId");

-- CreateIndex
CREATE INDEX "OilTransaction_storeNo_idx" ON "OilTransaction"("storeNo");
