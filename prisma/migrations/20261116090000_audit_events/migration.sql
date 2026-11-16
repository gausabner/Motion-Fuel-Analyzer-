-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "summary" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "AuditEvent_at_idx" ON "AuditEvent"("at");
CREATE INDEX "AuditEvent_area_at_idx" ON "AuditEvent"("area", "at");
