CREATE TYPE "ResourceType" AS ENUM ('VIDEO', 'DOCUMENT');
CREATE TYPE "ProgressStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');
CREATE TYPE "TaskStatus" AS ENUM ('ACTIVE', 'CANCELLED');
CREATE TYPE "NotificationType" AS ENUM ('TASK_ASSIGNED', 'TASK_REMINDER', 'TASK_DUE_SOON', 'TEACHER_DAILY_SUMMARY');

ALTER TABLE "Document" ADD COLUMN "pageCount" INTEGER;

CREATE TABLE "ResourceActivity" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resourceType" "ResourceType" NOT NULL,
    "videoId" TEXT,
    "documentId" TEXT,
    "status" "ProgressStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "positionSecs" INTEGER NOT NULL DEFAULT 0,
    "watchedIntervals" JSONB NOT NULL DEFAULT '[]',
    "coveredSecs" INTEGER NOT NULL DEFAULT 0,
    "percent" INTEGER NOT NULL DEFAULT 0,
    "lastPage" INTEGER,
    "pageCount" INTEGER,
    "markedCompleteAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "firstAccessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAccessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ResourceActivity_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ResourceActivity_one_resource" CHECK (num_nonnulls("videoId", "documentId") = 1)
);

CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Bookmark" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resourceType" "ResourceType" NOT NULL,
    "videoId" TEXT,
    "documentId" TEXT,
    "collectionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Bookmark_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Bookmark_one_resource" CHECK (num_nonnulls("videoId", "documentId") = 1)
);

CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "dueAt" TIMESTAMP(3),
    "resourceType" "ResourceType" NOT NULL,
    "videoId" TEXT,
    "documentId" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'ACTIVE',
    "cancelledAt" TIMESTAMP(3),
    "sectionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Task_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Task_one_resource" CHECK (num_nonnulls("videoId", "documentId") = 1)
);

CREATE TABLE "TaskAssignment" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "ProgressStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "completedAt" TIMESTAMP(3),
    "preCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaskReminder" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "taskAssignmentId" TEXT NOT NULL,
    "sentById" TEXT NOT NULL,
    "sentOn" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskReminder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
    "taskRemindersEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dueSoonLeadMins" INTEGER DEFAULT 1440,
    "quietFromMins" INTEGER,
    "quietToMins" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeviceToken" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ResourceActivity_userId_videoId_key" ON "ResourceActivity"("userId", "videoId");
CREATE UNIQUE INDEX "ResourceActivity_userId_documentId_key" ON "ResourceActivity"("userId", "documentId");
CREATE INDEX "ResourceActivity_schoolId_userId_lastAccessedAt_idx" ON "ResourceActivity"("schoolId", "userId", "lastAccessedAt");
CREATE INDEX "ResourceActivity_schoolId_userId_status_idx" ON "ResourceActivity"("schoolId", "userId", "status");
CREATE INDEX "ResourceActivity_videoId_idx" ON "ResourceActivity"("videoId");
CREATE INDEX "ResourceActivity_documentId_idx" ON "ResourceActivity"("documentId");
CREATE UNIQUE INDEX "Collection_ownerId_name_key" ON "Collection"("ownerId", "name");
CREATE INDEX "Collection_schoolId_ownerId_idx" ON "Collection"("schoolId", "ownerId");
CREATE UNIQUE INDEX "Bookmark_userId_videoId_key" ON "Bookmark"("userId", "videoId");
CREATE UNIQUE INDEX "Bookmark_userId_documentId_key" ON "Bookmark"("userId", "documentId");
CREATE INDEX "Bookmark_schoolId_userId_createdAt_idx" ON "Bookmark"("schoolId", "userId", "createdAt");
CREATE INDEX "Bookmark_collectionId_idx" ON "Bookmark"("collectionId");
CREATE INDEX "Task_schoolId_createdById_createdAt_idx" ON "Task"("schoolId", "createdById", "createdAt");
CREATE INDEX "Task_schoolId_status_dueAt_idx" ON "Task"("schoolId", "status", "dueAt");
CREATE UNIQUE INDEX "TaskAssignment_taskId_studentId_key" ON "TaskAssignment"("taskId", "studentId");
CREATE INDEX "TaskAssignment_schoolId_studentId_status_idx" ON "TaskAssignment"("schoolId", "studentId", "status");
CREATE INDEX "TaskAssignment_taskId_status_idx" ON "TaskAssignment"("taskId", "status");
CREATE UNIQUE INDEX "TaskReminder_taskAssignmentId_sentOn_key" ON "TaskReminder"("taskAssignmentId", "sentOn");
CREATE INDEX "TaskReminder_schoolId_createdAt_idx" ON "TaskReminder"("schoolId", "createdAt");
CREATE INDEX "Notification_schoolId_userId_createdAt_idx" ON "Notification"("schoolId", "userId", "createdAt");
CREATE INDEX "Notification_schoolId_userId_readAt_idx" ON "Notification"("schoolId", "userId", "readAt");
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");
CREATE INDEX "NotificationPreference_schoolId_idx" ON "NotificationPreference"("schoolId");
CREATE UNIQUE INDEX "DeviceToken_token_key" ON "DeviceToken"("token");
CREATE INDEX "DeviceToken_schoolId_userId_idx" ON "DeviceToken"("schoolId", "userId");

ALTER TABLE "ResourceActivity" ADD CONSTRAINT "ResourceActivity_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResourceActivity" ADD CONSTRAINT "ResourceActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResourceActivity" ADD CONSTRAINT "ResourceActivity_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResourceActivity" ADD CONSTRAINT "ResourceActivity_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskReminder" ADD CONSTRAINT "TaskReminder_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskReminder" ADD CONSTRAINT "TaskReminder_taskAssignmentId_fkey" FOREIGN KEY ("taskAssignmentId") REFERENCES "TaskAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskReminder" ADD CONSTRAINT "TaskReminder_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
