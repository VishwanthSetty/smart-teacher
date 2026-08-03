-- DropIndex
DROP INDEX "TeacherAssignment_schoolId_userId_subjectId_key";

-- AlterTable
ALTER TABLE "TeacherAssignment" ADD COLUMN     "sectionId" TEXT;

-- CreateIndex
CREATE INDEX "TeacherAssignment_sectionId_idx" ON "TeacherAssignment"("sectionId");

-- Postgres treats NULLs as distinct, so a plain composite unique on
-- (schoolId, userId, subjectId, sectionId) would not constrain section-less rows at all.
-- Two hand-written partial indexes instead (Prisma's @@unique cannot express WHERE),
-- following the same pattern as Enrollment's partial uniques:
--   - preserves the teacher CSV import's existing dedupe guarantee for section-less rows
--   - enforces the v1 rule that a (section, subject) pair has exactly one primary teacher
CREATE UNIQUE INDEX "TeacherAssignment_schoolId_userId_subjectId_nosection_key"
  ON "TeacherAssignment"("schoolId", "userId", "subjectId")
  WHERE "sectionId" IS NULL;

CREATE UNIQUE INDEX "TeacherAssignment_sectionId_subjectId_key"
  ON "TeacherAssignment"("sectionId", "subjectId")
  WHERE "sectionId" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "TeacherAssignment" ADD CONSTRAINT "TeacherAssignment_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
