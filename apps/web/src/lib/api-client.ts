import type {
  AuthUser,
  PaginatedResponse,
  Plan,
  School,
  SchoolStatus,
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
): Promise<TokenPair> {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, schoolSlug }),
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

export async function apiLogout(accessToken: string): Promise<void> {
  await fetch(`${API_URL}/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
}

export interface ListSchoolsQuery {
  page?: number;
  limit?: number;
  status?: SchoolStatus;
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
