-- AlterTable
ALTER TABLE "FuelTransaction" ADD COLUMN "uploadId" TEXT;
ALTER TABLE "FuelDelivery" ADD COLUMN "uploadId" TEXT;
ALTER TABLE "UploadedFile" ADD COLUMN "rolledBackAt" DATETIME;
ALTER TABLE "UploadedFile" ADD COLUMN "rolledBackBy" TEXT;
ALTER TABLE "ExceptionReview" ADD COLUMN "escalatedTo" TEXT;
ALTER TABLE "SystemSettings" ADD COLUMN "escalationUserId" TEXT;

-- CreateIndex
CREATE INDEX "FuelTransaction_uploadId_idx" ON "FuelTransaction"("uploadId");
