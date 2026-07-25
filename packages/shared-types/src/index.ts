// Mirrors the `Role` enum defined in apps/api/prisma/schema.prisma (the source of truth).
export enum Role {
  SUPER_ADMIN = 'SUPER_ADMIN',
  SCHOOL_ADMIN = 'SCHOOL_ADMIN',
  ADMIN = 'ADMIN',
  TEACHER = 'TEACHER',
}

// Mirrors the `SchoolStatus` enum in apps/api/prisma/schema.prisma.
export enum SchoolStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
}

// Mirrors the `Plan` enum in apps/api/prisma/schema.prisma (placeholder, no billing in v1).
export enum Plan {
  FREE = 'FREE',
  BASIC = 'BASIC',
  PRO = 'PRO',
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  schoolId: string | null;
}

export interface School {
  id: string;
  name: string;
  slug: string;
  academicYear: string;
  status: SchoolStatus;
  plan: Plan;
  createdAt: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface ApiErrorResponse {
  statusCode: number;
  message: string;
  error: string;
  timestamp: string;
  path: string;
}
