-- CreateTable: the Issue Vote -> department/division registry.
--
-- Backfilled into the migration history. CostCentre was originally created with
-- `prisma db push`, so no migration ever created it, and the later
-- add_costcentre_derived_from ALTER could not replay onto an empty database.
-- derivedFrom is deliberately absent here — that column is added by the
-- migration that follows.
CREATE TABLE "CostCentre" (
    "voteNo" TEXT NOT NULL PRIMARY KEY,
    "division" TEXT NOT NULL,
    "department" TEXT NOT NULL
);
