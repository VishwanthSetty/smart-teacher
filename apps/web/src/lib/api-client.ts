import type {
  AuthUser,
  DashboardStats,
  PaginatedResponse,
  Plan,
  School,
  SchoolStatus,
  Subject,
  SubjectStatus,
} from '@smart-teacher/shared-types';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new ApiError(response.status, body.message ?? 'Request failed');
  }
  return response.json() as Promise<T>;
}

export async function apiLogin(
  email: string,
  password: string,
  schoolSlug?: string,
  clientIp?: string,
): Promise<TokenPair> {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // The API sits behind this BFF, so req.ip would otherwise always be the
      // Next.js server's address — forward the real client IP for lockout tracking.
      ...(clientIp ? { 'X-Forwarded-For': clientIp } : {}),
    },
    body: JSON.stringify({ email, password, schoolSlug }),
    cache: 'no-store',
  });
  return handleResponse<TokenPair>(response);
}

export async function apiRefresh(refreshToken: string): Promise<TokenPair> {
  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${refreshToken}` },
    cache: 'no-store',
  });
  return handleResponse<TokenPair>(response);
}

export async function apiGetMe(accessToken: string): Promise<AuthUser> {
  const response = await fetch(`${API_URL}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return handleResponse<AuthUser>(response);
}

export async function apiLogout(accessToken: string, refreshToken?: string): Promise<void> {
  await fetch(`${API_URL}/auth/logout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ refreshToken }),
    cache: 'no-store',
  });
}

export async function apiSetPassword(token: string, password: string): Promise<void> {
  const response = await fetch(`${API_URL}/auth/set-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password }),
    cache: 'no-store',
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new ApiError(response.status, body.message ?? 'Request failed');
  }
}

export async function apiForgotPassword(
  email: string,
  schoolSlug?: string,
  clientIp?: string,
): Promise<void> {
  const response = await fetch(`${API_URL}/auth/forgot-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(clientIp ? { 'X-Forwarded-For': clientIp } : {}),
    },
    body: JSON.stringify({ email, schoolSlug }),
    cache: 'no-store',
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new ApiError(response.status, body.message ?? 'Request failed');
  }
}

export async function apiResetPassword(token: string, password: string): Promise<void> {
  const response = await fetch(`${API_URL}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password }),
    cache: 'no-store',
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new ApiError(response.status, body.message ?? 'Request failed');
  }
}

// SCHOOL_ADMIN only — any other role gets a 403 from the API, so callers must gate on
// role before reaching for this.
export async function apiGetDashboardStats(accessToken: string): Promise<DashboardStats> {
  const response = await fetch(`${API_URL}/admin/stats`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return handleResponse<DashboardStats>(response);
}

export interface ListSchoolsQuery {
  page?: number;
  limit?: number;
  status?: SchoolStatus;
  search?: string;
}

export interface CreateSchoolInput {
  name: string;
  slug: string;
  academicYear: string;
  plan?: Plan;
  adminEmail: string;
  adminName: string;
}

export interface UpdateSchoolInput {
  name?: string;
  status?: SchoolStatus;
}

export async function apiListSchools(
  accessToken: string,
  query: ListSchoolsQuery = {},
): Promise<PaginatedResponse<School>> {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  if (query.status) params.set('status', query.status);
  if (query.search) params.set('search', query.search);
  const search = params.toString();

  const response = await fetch(`${API_URL}/admin/schools${search ? `?${search}` : ''}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return handleResponse<PaginatedResponse<School>>(response);
}

export async function apiCreateSchool(
  accessToken: string,
  input: CreateSchoolInput,
): Promise<School> {
  const response = await fetch(`${API_URL}/admin/schools`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return handleResponse<School>(response);
}

export async function apiUpdateSchool(
  accessToken: string,
  id: string,
  patch: UpdateSchoolInput,
): Promise<School> {
  const response = await fetch(`${API_URL}/admin/schools/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(patch),
    cache: 'no-store',
  });
  return handleResponse<School>(response);
}

export interface CreateSubjectInput {
  name: string;
  code: string;
}

// No `code`: it is the canonical key content and timetables join on, and the API
// rejects it outright.
export interface UpdateSubjectInput {
  name?: string;
  status?: SubjectStatus;
}

// SUPER_ADMIN only, and unlike GET /subjects this includes retired subjects — the admin
// surface is the only place one can be reactivated from.
export async function apiListSubjects(accessToken: string): Promise<Subject[]> {
  const response = await fetch(`${API_URL}/admin/subjects`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return handleResponse<Subject[]>(response);
}

export async function apiCreateSubject(
  accessToken: string,
  input: CreateSubjectInput,
): Promise<Subject> {
  const response = await fetch(`${API_URL}/admin/subjects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return handleResponse<Subject>(response);
}

export async function apiUpdateSubject(
  accessToken: string,
  id: string,
  patch: UpdateSubjectInput,
): Promise<Subject> {
  const response = await fetch(`${API_URL}/admin/subjects/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(patch),
    cache: 'no-store',
  });
  return handleResponse<Subject>(response);
}
