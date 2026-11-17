-- CreateTable
CREATE TABLE "SetAsideTransaction" (
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
    "uploadId" TEXT,
    "reason" TEXT NOT NULL,
    "twinId" TEXT,
    "twinUnit" TEXT,
    "setAsideAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "setAsideBy" TEXT
);

-- CreateIndex
CREATE INDEX "SetAsideTransaction_uploadId_idx" ON "SetAsideTransaction"("uploadId");
