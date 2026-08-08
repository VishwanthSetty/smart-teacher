-- The plaintext copy is an explicit product requirement for school-admin credential handout.
-- Authentication continues to use password_hash exclusively.
ALTER TABLE "User" ADD COLUMN "plainPassword" TEXT;
