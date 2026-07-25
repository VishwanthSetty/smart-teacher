import { Role } from '@prisma/client';

export interface AuthenticatedUser {
  sub: string;
  email: string;
  name: string;
  role: Role;
  schoolId: string | null;
}
