-- CreateEnum
CREATE TYPE "ContentAudience" AS ENUM ('STUDENT', 'TEACHER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('UPLOADING', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "Curriculum" ADD COLUMN "audience" "ContentAudience" NOT NULL DEFAULT 'STUDENT';
ALTER TABLE "TeacherAssignment" ADD COLUMN "gradeLevelId" TEXT;

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "DocumentStatus" NOT NULL DEFAULT 'UPLOADING',
    "sourceKey" TEXT,
    "sizeBytes" INTEGER,
    "contentType" TEXT,
    "failureReason" TEXT,
    "contentNodeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

DROP INDEX "Curriculum_gradeLevelId_subjectId_key";
DROP INDEX "TeacherAssignment_schoolId_userId_subjectId_nosection_key";

CREATE UNIQUE INDEX "Curriculum_gradeLevelId_subjectId_audience_key" ON "Curriculum"("gradeLevelId", "subjectId", "audience");
CREATE INDEX "Curriculum_audience_status_idx" ON "Curriculum"("audience", "status");
CREATE UNIQUE INDEX "Document_sourceKey_key" ON "Document"("sourceKey");
CREATE INDEX "Document_contentNodeId_idx" ON "Document"("contentNodeId");
CREATE INDEX "Document_status_idx" ON "Document"("status");
CREATE INDEX "TeacherAssignment_gradeLevelId_idx" ON "TeacherAssignment"("gradeLevelId");

CREATE UNIQUE INDEX "TeacherAssignment_schoolId_userId_subjectId_bare_key"
  ON "TeacherAssignment"("schoolId", "userId", "subjectId")
  WHERE "sectionId" IS NULL AND "gradeLevelId" IS NULL;

CREATE UNIQUE INDEX "TeacherAssignment_schoolId_userId_subjectId_gradeLevelId_key"
  ON "TeacherAssignment"("schoolId", "userId", "subjectId", "gradeLevelId")
  WHERE "sectionId" IS NULL AND "gradeLevelId" IS NOT NULL;

ALTER TABLE "Document" ADD CONSTRAINT "Document_contentNodeId_fkey" FOREIGN KEY ("contentNodeId") REFERENCES "ContentNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeacherAssignment" ADD CONSTRAINT "TeacherAssignment_gradeLevelId_fkey" FOREIGN KEY ("gradeLevelId") REFERENCES "GradeLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
