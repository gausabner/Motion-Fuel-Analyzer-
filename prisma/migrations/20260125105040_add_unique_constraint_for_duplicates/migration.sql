/*
  Warnings:

  - A unique constraint covering the columns `[transDate,transRefNo,vehicleId,issueTime]` on the table `FuelTransaction` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "FuelTransaction_transDate_transRefNo_vehicleId_issueTime_key" ON "FuelTransaction"("transDate", "transRefNo", "vehicleId", "issueTime");
