-- CreateTable
CREATE TABLE "ExceptionRuleSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'global',
    "repeatFillEnabled" BOOLEAN NOT NULL DEFAULT true,
    "repeatFillMaxKm" REAL NOT NULL DEFAULT 15,
    "overCapacityEnabled" BOOLEAN NOT NULL DEFAULT true,
    "overCapacityFactor" REAL NOT NULL DEFAULT 1.5,
    "overCapacityMinLitres" REAL NOT NULL DEFAULT 20,
    "noDistanceEnabled" BOOLEAN NOT NULL DEFAULT true,
    "odometerBackEnabled" BOOLEAN NOT NULL DEFAULT true,
    "odometerMissingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "odometerMissingMinFills" INTEGER NOT NULL DEFAULT 3,
    "classOutlierEnabled" BOOLEAN NOT NULL DEFAULT true,
    "classOutlierMultiple" REAL NOT NULL DEFAULT 2,
    "odometerUnitsPerKm" REAL NOT NULL DEFAULT 10,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT
);

-- CreateTable
CREATE TABLE "ReferencePrice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fuel" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "effectiveFrom" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "ReferencePrice_fuel_effectiveFrom_key" ON "ReferencePrice"("fuel", "effectiveFrom");
CREATE INDEX "ReferencePrice_fuel_effectiveFrom_idx" ON "ReferencePrice"("fuel", "effectiveFrom");

-- Carry the two flat reference prices over as the first entry of each history,
-- effective from the first day there is any fuel issue on record.
INSERT INTO "ReferencePrice" ("id", "fuel", "price", "effectiveFrom")
SELECT 'seed-petrol', 'Petrol', s."petrolPrice",
       COALESCE((SELECT date(MIN("transDate"), 'localtime') FROM "FuelTransaction"), '2020-01-01')
FROM "SystemSettings" s WHERE s."id" = 'global' AND s."petrolPrice" > 0;

INSERT INTO "ReferencePrice" ("id", "fuel", "price", "effectiveFrom")
SELECT 'seed-diesel', 'Diesel', s."dieselPrice",
       COALESCE((SELECT date(MIN("transDate"), 'localtime') FROM "FuelTransaction"), '2020-01-01')
FROM "SystemSettings" s WHERE s."id" = 'global' AND s."dieselPrice" > 0;
