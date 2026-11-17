-- AlterTable
ALTER TABLE "TankDefinition" ADD COLUMN "name" TEXT;
ALTER TABLE "TankDefinition" ADD COLUMN "capacityLitres" REAL;
ALTER TABLE "TankDefinition" ADD COLUMN "reorderLitres" REAL;

-- CreateTable
CREATE TABLE "TankDip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tankNo" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "litres" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "TankDip_tankNo_day_key" ON "TankDip"("tankNo", "day");
CREATE INDEX "TankDip_tankNo_day_idx" ON "TankDip"("tankNo", "day");
