-- AlterTable: add auditable provenance for auto-resolved cost centres
ALTER TABLE "CostCentre" ADD COLUMN "derivedFrom" TEXT;
