-- CreateEnum
CREATE TYPE "SubjectStatus" AS ENUM ('ACTIVE', 'RETIRED');

-- Rename rather than drop-and-add. Prisma's own diff proposed DROP "slug" + ADD "code",
-- which would discard the live values that Video and SchoolContentEntitlement rows are
-- keyed against; this migration is hand-written for that reason.
ALTER TABLE "Subject" RENAME COLUMN "slug" TO "code";

-- Postgres carries the unique index across a column rename but keeps its old name, and
-- Prisma derives "<Table>_<column>_key" for @unique — without this the next `migrate dev`
-- reports drift on Subject.code.
ALTER INDEX "Subject_slug_key" RENAME TO "Subject_code_key";

-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "status" "SubjectStatus" NOT NULL DEFAULT 'ACTIVE';
