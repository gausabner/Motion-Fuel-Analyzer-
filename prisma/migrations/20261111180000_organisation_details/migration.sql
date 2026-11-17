-- AlterTable
ALTER TABLE "SystemSettings" ADD COLUMN "orgName" TEXT;
ALTER TABLE "SystemSettings" ADD COLUMN "orgLogo" TEXT;
ALTER TABLE "SystemSettings" ADD COLUMN "signatoryName" TEXT;
ALTER TABLE "SystemSettings" ADD COLUMN "signatoryTitle" TEXT;
ALTER TABLE "SystemSettings" ADD COLUMN "reportFooter" TEXT;
ALTER TABLE "SystemSettings" ADD COLUMN "financialYearStartMonth" INTEGER NOT NULL DEFAULT 1;
