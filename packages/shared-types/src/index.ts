// Mirrors the `Role` enum defined in apps/api/prisma/schema.prisma (the source of truth).
export enum Role {
  SUPER_ADMIN = 'SUPER_ADMIN',
  SCHOOL_ADMIN = 'SCHOOL_ADMIN',
  TEACHER = 'TEACHER',
  STUDENT = 'STUDENT',
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

// Mirrors the `UserStatus` enum in apps/api/prisma/schema.prisma.
export enum UserStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  DISABLED = 'DISABLED',
}

// Mirrors the `SubjectStatus` enum in apps/api/prisma/schema.prisma.
export enum SubjectStatus {
  ACTIVE = 'ACTIVE',
  RETIRED = 'RETIRED',
}

// The slice of the caller's school carried on /users/me, so the admin shell can render
// the school name without a second round-trip. Deliberately narrower than `School` —
// a tenant user has no business reading another tenant's plan or admin email.
export interface AuthUserSchool {
  id: string;
  name: string;
  slug: string;
  status: SchoolStatus;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  schoolId: string | null;
  // null for SUPER_ADMIN, who belongs to no tenant.
  school: AuthUserSchool | null;
}

export interface School {
  id: string;
  name: string;
  slug: string;
  academicYear: string;
  status: SchoolStatus;
  plan: Plan;
  adminEmail: string | null;
  createdAt: string;
}

// The canonical platform taxonomy a school selects from — it never creates its own.
// `code` is the immutable join key shared by videos, entitlements and timetable slots.
export interface Subject {
  id: string;
  name: string;
  code: string;
  status: SubjectStatus;
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

export interface LatestTimetableLink {
  id: string;
  name: string;
  href: string;
}

// Counts backing the admin dashboard. `classes` and `latestTimetable` are null rather
// than 0/absent because the Class and Timetable models do not exist yet (F-08/F-09) —
// null lets the UI render an honest "—" instead of a misleading zero.
export interface DashboardStats {
  students: number;
  teachers: number;
  pendingInvites: number;
  classes: number | null;
  latestTimetable: LatestTimetableLink | null;
}

export interface ApiErrorResponse {
  statusCode: number;
  message: string;
  error: string;
  timestamp: string;
  path: string;
}
