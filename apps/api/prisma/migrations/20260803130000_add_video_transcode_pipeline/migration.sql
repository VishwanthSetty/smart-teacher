-- AlterEnum
ALTER TYPE "VideoStatus" ADD VALUE 'PROCESSING';

-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "playlistKey" TEXT,
ADD COLUMN     "posterKey" TEXT,
ADD COLUMN     "transcodeAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "transcodeStartedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "VideoRendition" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bitrateKbps" INTEGER NOT NULL,
    "playlistKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoRendition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VideoRendition_videoId_name_key" ON "VideoRendition"("videoId", "name");

-- CreateIndex
CREATE INDEX "Video_status_updatedAt_idx" ON "Video"("status", "updatedAt");

-- AddForeignKey
ALTER TABLE "VideoRendition" ADD CONSTRAINT "VideoRendition_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;
