-- CreateEnum
CREATE TYPE "RefreshTokenRevokeReason" AS ENUM ('ROTATED', 'REUSE_DETECTED', 'LOGGED_OUT');

-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN     "revokeReason" "RefreshTokenRevokeReason";
