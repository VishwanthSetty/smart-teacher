-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN "isCurrent" BOOLEAN NOT NULL DEFAULT false;

-- Until now a student could hold only one ACTIVE enrollment, so every ACTIVE row is that
-- student's only class and therefore their current one.
UPDATE "Enrollment" SET "isCurrent" = true WHERE "status" = 'ACTIVE';

-- Partial unique indexes, added by hand: @@unique cannot express a WHERE clause.
-- Replaces the one-class-per-student cap with one current class per student.
DROP INDEX "Enrollment_userId_active_key";
CREATE UNIQUE INDEX "Enrollment_userId_current_key" ON "Enrollment"("userId") WHERE "status" = 'ACTIVE' AND "isCurrent";

-- A student is never actively enrolled twice in the same section.
CREATE UNIQUE INDEX "Enrollment_userId_sectionId_active_key" ON "Enrollment"("userId", "sectionId") WHERE "status" = 'ACTIVE';
