-- CreateEnum
CREATE TYPE "TeacherImportBatchStatus" AS ENUM ('DRAFT', 'COMMITTED');

-- CreateTable
CREATE TABLE "TeacherAssignment" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherImportBatch" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" "TeacherImportBatchStatus" NOT NULL DEFAULT 'DRAFT',
    "totalRows" INTEGER NOT NULL,
    "validCount" INTEGER NOT NULL,
    "invalidCount" INTEGER NOT NULL,
    "validRows" JSONB NOT NULL,
    "invalidRows" JSONB NOT NULL,
    "warnings" JSONB NOT NULL,
    "committedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeacherAssignment_schoolId_idx" ON "TeacherAssignment"("schoolId");

-- CreateIndex
CREATE INDEX "TeacherAssignment_userId_idx" ON "TeacherAssignment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherAssignment_schoolId_userId_subjectId_key" ON "TeacherAssignment"("schoolId", "userId", "subjectId");

-- CreateIndex
CREATE INDEX "TeacherImportBatch_schoolId_createdAt_idx" ON "TeacherImportBatch"("schoolId", "createdAt");

-- AddForeignKey
ALTER TABLE "TeacherAssignment" ADD CONSTRAINT "TeacherAssignment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherAssignment" ADD CONSTRAINT "TeacherAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherAssignment" ADD CONSTRAINT "TeacherAssignment_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherImportBatch" ADD CONSTRAINT "TeacherImportBatch_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherImportBatch" ADD CONSTRAINT "TeacherImportBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
