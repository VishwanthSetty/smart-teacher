-- AlterEnum
-- Postgres cannot DROP an enum value, so the type is rebuilt: new type, column re-cast
-- with a remap, old type dropped, then renamed into place. ADMIN and SCHOOL_ADMIN were
-- granted identically on every route, so collapsing ADMIN into SCHOOL_ADMIN preserves
-- behaviour. Takes a brief ACCESS EXCLUSIVE lock on "User".
BEGIN;

CREATE TYPE "Role_new" AS ENUM ('SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'STUDENT');

-- The default references the old type and would block the ALTER TYPE below.
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "User"
  ALTER COLUMN "role" TYPE "Role_new"
  USING (CASE "role"::text WHEN 'ADMIN' THEN 'SCHOOL_ADMIN' ELSE "role"::text END)::"Role_new";

ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "Role_old";

ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'TEACHER';

COMMIT;
