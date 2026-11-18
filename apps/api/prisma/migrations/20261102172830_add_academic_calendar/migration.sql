-- CreateEnum
CREATE TYPE "AcademicCalendarStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "AcademicYear" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademicYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformAcademicCalendar" (
    "id" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "gradeLevelId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "status" "AcademicCalendarStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformAcademicCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformAcademicCalendarEntry" (
    "id" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformAcademicCalendarEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolAcademicCalendar" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "gradeLevelId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "status" "AcademicCalendarStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolAcademicCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolAcademicCalendarEntry" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolAcademicCalendarEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolAcademicCalendarSetting" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolAcademicCalendarSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AcademicYear_label_key" ON "AcademicYear"("label");

-- CreateIndex
CREATE INDEX "PlatformAcademicCalendar_academicYearId_status_idx" ON "PlatformAcademicCalendar"("academicYearId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAcademicCalendar_academicYearId_gradeLevelId_subjec_key" ON "PlatformAcademicCalendar"("academicYearId", "gradeLevelId", "subjectId");

-- CreateIndex
CREATE INDEX "PlatformAcademicCalendarEntry_calendarId_date_idx" ON "PlatformAcademicCalendarEntry"("calendarId", "date");

-- CreateIndex
CREATE INDEX "SchoolAcademicCalendar_schoolId_academicYearId_status_idx" ON "SchoolAcademicCalendar"("schoolId", "academicYearId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolAcademicCalendar_schoolId_academicYearId_gradeLevelId_key" ON "SchoolAcademicCalendar"("schoolId", "academicYearId", "gradeLevelId", "subjectId");

-- CreateIndex
CREATE INDEX "SchoolAcademicCalendarEntry_schoolId_idx" ON "SchoolAcademicCalendarEntry"("schoolId");

-- CreateIndex
CREATE INDEX "SchoolAcademicCalendarEntry_calendarId_date_idx" ON "SchoolAcademicCalendarEntry"("calendarId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolAcademicCalendarSetting_schoolId_academicYearId_key" ON "SchoolAcademicCalendarSetting"("schoolId", "academicYearId");

-- AddForeignKey
ALTER TABLE "PlatformAcademicCalendar" ADD CONSTRAINT "PlatformAcademicCalendar_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformAcademicCalendar" ADD CONSTRAINT "PlatformAcademicCalendar_gradeLevelId_fkey" FOREIGN KEY ("gradeLevelId") REFERENCES "GradeLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformAcademicCalendar" ADD CONSTRAINT "PlatformAcademicCalendar_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformAcademicCalendarEntry" ADD CONSTRAINT "PlatformAcademicCalendarEntry_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "PlatformAcademicCalendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolAcademicCalendar" ADD CONSTRAINT "SchoolAcademicCalendar_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolAcademicCalendar" ADD CONSTRAINT "SchoolAcademicCalendar_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolAcademicCalendar" ADD CONSTRAINT "SchoolAcademicCalendar_gradeLevelId_fkey" FOREIGN KEY ("gradeLevelId") REFERENCES "GradeLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolAcademicCalendar" ADD CONSTRAINT "SchoolAcademicCalendar_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolAcademicCalendarEntry" ADD CONSTRAINT "SchoolAcademicCalendarEntry_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolAcademicCalendarEntry" ADD CONSTRAINT "SchoolAcademicCalendarEntry_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "SchoolAcademicCalendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolAcademicCalendarSetting" ADD CONSTRAINT "SchoolAcademicCalendarSetting_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolAcademicCalendarSetting" ADD CONSTRAINT "SchoolAcademicCalendarSetting_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
