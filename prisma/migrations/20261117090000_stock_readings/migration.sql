-- CreateTable
CREATE TABLE "StockReading" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tankNo" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "litres" REAL NOT NULL,
    "reportMax" REAL,
    "uploadId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "StockReading_tankNo_day_key" ON "StockReading"("tankNo", "day");

-- CreateIndex
CREATE INDEX "StockReading_uploadId_idx" ON "StockReading"("uploadId");
