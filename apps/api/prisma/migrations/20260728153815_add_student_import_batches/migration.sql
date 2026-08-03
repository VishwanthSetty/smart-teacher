-- CreateEnum
CREATE TYPE "StudentImportBatchStatus" AS ENUM ('DRAFT', 'COMMITTED');

-- CreateTable
CREATE TABLE "StudentImportBatch" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" "StudentImportBatchStatus" NOT NULL DEFAULT 'DRAFT',
    "totalRows" INTEGER NOT NULL,
    "validCount" INTEGER NOT NULL,
    "invalidCount" INTEGER NOT NULL,
    "validRows" JSONB NOT NULL,
    "invalidRows" JSONB NOT NULL,
    "warnings" JSONB NOT NULL,
    "committedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudentImportBatch_schoolId_createdAt_idx" ON "StudentImportBatch"("schoolId", "createdAt");

-- AddForeignKey
ALTER TABLE "StudentImportBatch" ADD CONSTRAINT "StudentImportBatch_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentImportBatch" ADD CONSTRAINT "StudentImportBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
