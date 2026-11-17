-- CreateTable
CREATE TABLE "ExceptionReview" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL,
    "reviewedBy" TEXT,
    "reviewedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
