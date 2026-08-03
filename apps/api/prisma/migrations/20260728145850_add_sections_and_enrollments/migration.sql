-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'ENDED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "lastName" TEXT;

-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "gradeLevelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "rollNumber" TEXT,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Section_schoolId_idx" ON "Section"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "Section_schoolId_gradeLevelId_name_key" ON "Section"("schoolId", "gradeLevelId", "name");

-- CreateIndex
CREATE INDEX "Enrollment_schoolId_idx" ON "Enrollment"("schoolId");

-- CreateIndex
CREATE INDEX "Enrollment_userId_status_idx" ON "Enrollment"("userId", "status");

-- CreateIndex
CREATE INDEX "Enrollment_sectionId_status_idx" ON "Enrollment"("sectionId", "status");

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_gradeLevelId_fkey" FOREIGN KEY ("gradeLevelId") REFERENCES "GradeLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One ACTIVE section per student. Partial so ENDED history rows never collide, and
-- expressed by hand because Prisma's @@unique cannot carry a WHERE clause.
CREATE UNIQUE INDEX "Enrollment_userId_active_key" ON "Enrollment"("userId") WHERE "status" = 'ACTIVE';

-- Roll number unique within a section, among current members only, and only when set.
CREATE UNIQUE INDEX "Enrollment_sectionId_rollNumber_active_key" ON "Enrollment"("sectionId", "rollNumber") WHERE "status" = 'ACTIVE' AND "rollNumber" IS NOT NULL;
