-- CreateEnum
CREATE TYPE "CurriculumStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- DropForeignKey
ALTER TABLE "SchoolContentEntitlement" DROP CONSTRAINT "SchoolContentEntitlement_gradeLevelId_fkey";

-- DropForeignKey
ALTER TABLE "SchoolContentEntitlement" DROP CONSTRAINT "SchoolContentEntitlement_subjectId_fkey";

-- DropForeignKey
ALTER TABLE "Video" DROP CONSTRAINT "Video_gradeLevelId_fkey";

-- DropForeignKey
ALTER TABLE "Video" DROP CONSTRAINT "Video_subjectId_fkey";

-- DropIndex
DROP INDEX "SchoolContentEntitlement_schoolId_gradeLevelId_subjectId_key";

-- DropIndex
DROP INDEX "Video_gradeLevelId_subjectId_idx";

-- AlterTable
ALTER TABLE "SchoolContentEntitlement" DROP COLUMN "gradeLevelId",
DROP COLUMN "subjectId",
ADD COLUMN     "curriculumId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Video" DROP COLUMN "gradeLevelId",
DROP COLUMN "subjectId",
ADD COLUMN     "contentNodeId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "CurriculumSchema" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CurriculumSchema_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CurriculumLevel" (
    "id" TEXT NOT NULL,
    "schemaId" TEXT NOT NULL,
    "depth" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "canHoldContent" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CurriculumLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Curriculum" (
    "id" TEXT NOT NULL,
    "gradeLevelId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "schemaId" TEXT NOT NULL,
    "status" "CurriculumStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Curriculum_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentNode" (
    "id" TEXT NOT NULL,
    "curriculumId" TEXT NOT NULL,
    "parentId" TEXT,
    "depth" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentNode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CurriculumSchema_code_key" ON "CurriculumSchema"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CurriculumLevel_schemaId_depth_key" ON "CurriculumLevel"("schemaId", "depth");

-- CreateIndex
CREATE UNIQUE INDEX "CurriculumLevel_schemaId_name_key" ON "CurriculumLevel"("schemaId", "name");

-- CreateIndex
CREATE INDEX "Curriculum_status_idx" ON "Curriculum"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Curriculum_gradeLevelId_subjectId_key" ON "Curriculum"("gradeLevelId", "subjectId");

-- CreateIndex
CREATE INDEX "ContentNode_curriculumId_path_idx" ON "ContentNode"("curriculumId", "path");

-- CreateIndex
CREATE INDEX "ContentNode_parentId_sortOrder_idx" ON "ContentNode"("parentId", "sortOrder");

-- CreateIndex
CREATE INDEX "ContentNode_curriculumId_depth_idx" ON "ContentNode"("curriculumId", "depth");

-- CreateIndex
CREATE UNIQUE INDEX "ContentNode_curriculumId_code_key" ON "ContentNode"("curriculumId", "code");

-- CreateIndex
CREATE INDEX "SchoolContentEntitlement_curriculumId_idx" ON "SchoolContentEntitlement"("curriculumId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolContentEntitlement_schoolId_curriculumId_key" ON "SchoolContentEntitlement"("schoolId", "curriculumId");

-- CreateIndex
CREATE INDEX "Video_contentNodeId_idx" ON "Video"("contentNodeId");

-- AddForeignKey
ALTER TABLE "CurriculumLevel" ADD CONSTRAINT "CurriculumLevel_schemaId_fkey" FOREIGN KEY ("schemaId") REFERENCES "CurriculumSchema"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Curriculum" ADD CONSTRAINT "Curriculum_gradeLevelId_fkey" FOREIGN KEY ("gradeLevelId") REFERENCES "GradeLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Curriculum" ADD CONSTRAINT "Curriculum_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Curriculum" ADD CONSTRAINT "Curriculum_schemaId_fkey" FOREIGN KEY ("schemaId") REFERENCES "CurriculumSchema"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentNode" ADD CONSTRAINT "ContentNode_curriculumId_fkey" FOREIGN KEY ("curriculumId") REFERENCES "Curriculum"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentNode" ADD CONSTRAINT "ContentNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Video" ADD CONSTRAINT "Video_contentNodeId_fkey" FOREIGN KEY ("contentNodeId") REFERENCES "ContentNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolContentEntitlement" ADD CONSTRAINT "SchoolContentEntitlement_curriculumId_fkey" FOREIGN KEY ("curriculumId") REFERENCES "Curriculum"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

