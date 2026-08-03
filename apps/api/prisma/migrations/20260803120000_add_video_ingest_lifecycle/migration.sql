-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('UPLOADING', 'QUEUED', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "status" "VideoStatus" NOT NULL DEFAULT 'UPLOADING',
ADD COLUMN     "sourceKey" TEXT,
ADD COLUMN     "sizeBytes" INTEGER,
ADD COLUMN     "contentType" TEXT;

-- Hand-written for the two statements below; the rest is Prisma's own diff.
--
-- externalId becomes nullable because ingest now creates the row before the media
-- exists. Existing rows all predate ingest and were created with a handle already
-- resolved to playable content, so they are READY — leaving them on the new
-- UPLOADING default would empty every school's library on deploy.
ALTER TABLE "Video" ALTER COLUMN "externalId" DROP NOT NULL;

UPDATE "Video" SET "status" = 'READY' WHERE "externalId" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Video_sourceKey_key" ON "Video"("sourceKey");

-- CreateIndex
CREATE INDEX "Video_status_idx" ON "Video"("status");
