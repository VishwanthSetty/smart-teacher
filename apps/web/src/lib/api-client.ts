import type {
  AuthUser,
  DashboardStats,
  Entitlement,
  GradeLevel,
  PaginatedResponse,
  Plan,
  School,
  SchoolStatus,
  Section,
  Student,
  StudentImportPreview,
  StudentImportResult,
  Subject,
  SubjectStatus,
  Teacher,
  TeacherAssignment,
  TeacherImportPreview,
  TeacherImportResult,
  User,
  UserStatus,
  AdminVideo,
  AdminVideoDetail,
  ContentImpact,
  ListAdminVideosQuery,
  PlaybackTicket,
  UpdateVideoInput,
  VideoUploadTicket,
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

// The CSV endpoints answer text/csv, so handleResponse's response.json() would throw on
// the success path. The error path is still JSON — the API's exception filter shapes
// every failure the same way regardless of the route's success content type.
async function handleCsvResponse(response: Response): Promise<string> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new ApiError(response.status, body.message ?? 'Request failed');
  }
  return response.text();
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

export async function apiGetSchool(accessToken: string, id: string): Promise<School> {
  const response = await fetch(`${API_URL}/admin/schools/${id}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return handleResponse<School>(response);
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

export async function apiListUsers(accessToken: string): Promise<User[]> {
  const response = await fetch(`${API_URL}/admin/users`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return handleResponse<User[]>(response);
}

export async function apiGetUser(accessToken: string, id: string): Promise<User> {
  const response = await fetch(`${API_URL}/admin/users/${id}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return handleResponse<User>(response);
}

// No Content-Type header on purpose: undici derives the multipart boundary from the
// FormData itself, and setting the header by hand strips it and breaks the upload.
export async function apiUploadTeacherImport(
  accessToken: string,
  form: FormData,
): Promise<TeacherImportPreview> {
  const response = await fetch(`${API_URL}/teachers/bulk`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
    cache: 'no-store',
  });
  return handleResponse<TeacherImportPreview>(response);
}

export async function apiConfirmTeacherImport(
  accessToken: string,
  batchId: string,
): Promise<TeacherImportResult> {
  const response = await fetch(`${API_URL}/teachers/bulk/${batchId}/confirm`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return handleResponse<TeacherImportResult>(response);
}

export async function apiGetTeacherImportTemplate(accessToken: string): Promise<string> {
  const response = await fetch(`${API_URL}/teachers/bulk/template`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return handleCsvResponse(response);
}

export async function apiGetTeacherImportErrors(
  accessToken: string,
  batchId: string,
): Promise<string> {
  const response = await fetch(`${API_URL}/teachers/bulk/${batchId}/errors`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return handleCsvResponse(response);
}

// SCHOOL_ADMIN and TEACHER — read-only for TEACHER, the API 403s their POST/PATCH.
export async function apiListGradeLevels(accessToken: string): Promise<GradeLevel[]> {
  const response = await fetch(`${API_URL}/grade-levels`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return handleResponse<GradeLevel[]>(response);
}

export interface CreateGradeLevelInput {
  name: string;
  rank: number;
}

// SUPER_ADMIN only. Unlike apiListGradeLevels above (@AnyRole(), /grade-levels), this
// hits the admin route — same response shape, but this is the one gated to the taxonomy
// management page.
export async function apiListAdminGradeLevels(accessToken: string): Promise<GradeLevel[]> {
  const response = await fetch(`${API_URL}/admin/grade-levels`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return handleResponse<GradeLevel[]>(response);
}

export async function apiCreateGradeLevel(
  accessToken: string,
  input: CreateGradeLevelInput,
): Promise<GradeLevel> {
  const response = await fetch(`${API_URL}/admin/grade-levels`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return handleResponse<GradeLevel>(response);
}

export interface UpdateGradeLevelInput {
  name?: string;
  rank?: number;
}

export async function apiUpdateGradeLevel(
  accessToken: string,
  id: string,
  patch: UpdateGradeLevelInput,
): Promise<GradeLevel> {
  const response = await fetch(`${API_URL}/admin/grade-levels/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(patch),
    cache: 'no-store',
  });
  return handleResponse<GradeLevel>(response);
}

// 204 No Content on success, so this can't go through handleResponse — response.json()
// would throw on an empty body. The API 409s if a video, entitlement or section still
// references the grade level.
export async function apiDeleteGradeLevel(accessToken: string, id: string): Promise<void> {
  const response = await fetch(`${API_URL}/admin/grade-levels/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new ApiError(response.status, body.message ?? 'Request failed');
  }
}

export async function apiListSections(accessToken: string): Promise<Section[]> {
  const response = await fetch(`${API_URL}/sections`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return handleResponse<Section[]>(response);
}

export interface CreateSectionInput {
  gradeLevelId: string;
  name: string;
}

export async function apiCreateSection(accessToken: string, input: CreateSectionInput): Promise<Section> {
  const response = await fetch(`${API_URL}/sections`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return handleResponse<Section>(response);
}

// SUPER_ADMIN only. Returns the whole catalogue including in-flight and failed
// uploads — the school-facing GET /videos only ever answers READY content.
export async function apiListAdminVideos(
  accessToken: string,
  query: ListAdminVideosQuery = {},
): Promise<PaginatedResponse<AdminVideo>> {
  const params = new URLSearchParams();
  if (query.status) params.set('status', query.status);
  if (query.gradeLevelId) params.set('gradeLevelId', query.gradeLevelId);
  if (query.subjectId) params.set('subjectId', query.subjectId);
  if (query.search) params.set('search', query.search);
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  const search = params.toString();
  const response = await fetch(`${API_URL}/admin/videos${search ? `?${search}` : ''}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return handleResponse<PaginatedResponse<AdminVideo>>(response);
}

// SUPER_ADMIN only. Includes storage diagnostics and rendition rows.
export async function apiGetAdminVideo(
  accessToken: string,
  id: string,
): Promise<AdminVideoDetail> {
  const response = await fetch(`${API_URL}/admin/videos/${id}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return handleResponse<AdminVideoDetail>(response);
}

export async function apiUpdateVideo(
  accessToken: string,
  id: string,
  input: UpdateVideoInput,
): Promise<AdminVideoDetail> {
  const response = await fetch(`${API_URL}/admin/videos/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return handleResponse<AdminVideoDetail>(response);
}

export interface CreateVideoInput {
  title: string;
  description?: string;
  gradeLevelId: string;
  subjectId: string;
  contentType: string;
  sizeBytes: number;
}

// Creates the record in UPLOADING and returns a short-lived presigned PUT. The browser
// uploads to that URL directly — the bytes never pass through this app or the API.
export async function apiCreateVideo(
  accessToken: string,
  input: CreateVideoInput,
): Promise<VideoUploadTicket> {
  const response = await fetch(`${API_URL}/admin/videos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return handleResponse<VideoUploadTicket>(response);
}

export interface RequestVideoUploadInput {
  contentType: string;
  sizeBytes: number;
}

// Retry for an abandoned or failed upload: same record and key, fresh URL.
export async function apiCreateVideoUploadUrl(
  accessToken: string,
  id: string,
  input: RequestVideoUploadInput,
): Promise<VideoUploadTicket> {
  const response = await fetch(`${API_URL}/admin/videos/${id}/upload-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return handleResponse<VideoUploadTicket>(response);
}

// The API verifies the object actually landed before queueing, so this 400s when the
// upload was abandoned or the stored file fails its size/type check.
export async function apiConfirmVideoUpload(
  accessToken: string,
  id: string,
): Promise<AdminVideo> {
  const response = await fetch(`${API_URL}/admin/videos/${id}/uploaded`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return handleResponse<AdminVideo>(response);
}

// Re-drives a transcode from the source already in the bucket. Only a FAILED video
// qualifies; the API 409s otherwise, including when the source object has since gone.
export async function apiRetryVideo(
  accessToken: string,
  id: string,
): Promise<AdminVideo> {
  const response = await fetch(`${API_URL}/admin/videos/${id}/retry`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return handleResponse<AdminVideo>(response);
}

// 204 No Content on success, so this can't go through handleResponse. The API 409s on a
// READY video — this is the ingest cleanup path, not content retirement.
export async function apiDeleteVideo(accessToken: string, id: string): Promise<void> {
  const response = await fetch(`${API_URL}/admin/videos/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new ApiError(response.status, body.message ?? 'Request failed');
  }
}

// SUPER_ADMIN-only cross-tenant counts used before retiring or reassigning content.
export async function apiGetContentImpact(
  accessToken: string,
  gradeLevelId: string,
  subjectId: string,
): Promise<ContentImpact> {
  const params = new URLSearchParams({ gradeLevelId, subjectId });
  const response = await fetch(`${API_URL}/admin/content-impact?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return handleResponse<ContentImpact>(response);
}

// SUPER_ADMIN, TEACHER, or STUDENT; the API re-checks entitlement at every mint.
export async function apiCreatePlayback(
  accessToken: string,
  id: string,
): Promise<PlaybackTicket> {
  const response = await fetch(`${API_URL}/videos/${id}/playback`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return handleResponse<PlaybackTicket>(response);
}

// @AnyRole() and active-only, unlike apiListSubjects above (SUPER_ADMIN, includes
// retired) — this is the one a School Admin can call to populate an assignment form.
export async function apiListActiveSubjects(accessToken: string): Promise<Subject[]> {
  const response = await fetch(`${API_URL}/subjects`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return handleResponse<Subject[]>(response);
}

export interface ListTeacherAssignmentsQuery {
  teacherId?: string;
  sectionId?: string;
  subjectId?: string;
}

export async function apiListTeacherAssignments(
  accessToken: string,
  query: ListTeacherAssignmentsQuery = {},
): Promise<TeacherAssignment[]> {
  const params = new URLSearchParams();
  if (query.teacherId) params.set('teacherId', query.teacherId);
  if (query.sectionId) params.set('sectionId', query.sectionId);
  if (query.subjectId) params.set('subjectId', query.subjectId);
  const search = params.toString();

  const response = await fetch(`${API_URL}/teacher-assignments${search ? `?${search}` : ''}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return handleResponse<TeacherAssignment[]>(response);
}

export interface CreateTeacherAssignmentInput {
  teacherId: string;
  subjectId: string;
  sectionId?: string;
}

export async function apiCreateTeacherAssignment(
  accessToken: string,
  input: CreateTeacherAssignmentInput,
): Promise<TeacherAssignment> {
  const response = await fetch(`${API_URL}/teacher-assignments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return handleResponse<TeacherAssignment>(response);
}

// 204 No Content on success, so this can't go through handleResponse — response.json()
// would throw on an empty body.
export async function apiDeleteTeacherAssignment(accessToken: string, id: string): Promise<void> {
  const response = await fetch(`${API_URL}/teacher-assignments/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new ApiError(response.status, body.message ?? 'Request failed');
  }
}

// School content entitlements — SUPER_ADMIN only, and school-scoped by path rather than by
// the caller's tenant, so every call names the school explicitly.
export async function apiListSchoolEntitlements(
  accessToken: string,
  schoolId: string,
): Promise<Entitlement[]> {
  const response = await fetch(`${API_URL}/admin/schools/${schoolId}/entitlements`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return handleResponse<Entitlement[]>(response);
}

export interface GrantEntitlementInput {
  gradeLevelId: string;
  subjectId: string;
}

export async function apiGrantSchoolEntitlement(
  accessToken: string,
  schoolId: string,
  input: GrantEntitlementInput,
): Promise<Entitlement> {
  const response = await fetch(`${API_URL}/admin/schools/${schoolId}/entitlements`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return handleResponse<Entitlement>(response);
}

// 204 No Content on success, so this can't go through handleResponse — response.json()
// would throw on an empty body.
export async function apiRevokeSchoolEntitlement(
  accessToken: string,
  schoolId: string,
  id: string,
): Promise<void> {
  const response = await fetch(`${API_URL}/admin/schools/${schoolId}/entitlements/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new ApiError(response.status, body.message ?? 'Request failed');
  }
}

export interface ListStudentsQuery {
  page?: number;
  limit?: number;
  search?: string;
  sectionId?: string;
  status?: UserStatus;
}

export async function apiListStudents(
  accessToken: string,
  query: ListStudentsQuery = {},
): Promise<PaginatedResponse<Student>> {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  if (query.search) params.set('search', query.search);
  if (query.sectionId) params.set('sectionId', query.sectionId);
  if (query.status) params.set('status', query.status);
  const search = params.toString();

  const response = await fetch(`${API_URL}/students${search ? `?${search}` : ''}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return handleResponse<PaginatedResponse<Student>>(response);
}

export interface CreateStudentInput {
  firstName: string;
  lastName: string;
  email: string;
  rollNumber?: string;
  sectionId: string;
}

export interface CreateTeacherInput {
  firstName: string;
  lastName: string;
  email: string;
  subjectIds?: string[];
}

export async function apiCreateTeacher(accessToken: string, input: CreateTeacherInput): Promise<Teacher> {
  const response = await fetch(`${API_URL}/teachers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return handleResponse<Teacher>(response);
}

export async function apiCreateStudent(accessToken: string, input: CreateStudentInput): Promise<Student> {
  const response = await fetch(`${API_URL}/students`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return handleResponse<Student>(response);
}

export interface UpdateStudentInput {
  firstName?: string;
  lastName?: string;
  rollNumber?: string;
  sectionId?: string;
  status?: UserStatus;
}

export async function apiUpdateStudent(
  accessToken: string,
  id: string,
  patch: UpdateStudentInput,
): Promise<Student> {
  const response = await fetch(`${API_URL}/students/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(patch),
    cache: 'no-store',
  });
  return handleResponse<Student>(response);
}

// No Content-Type header on purpose: undici derives the multipart boundary from the
// FormData itself, and setting the header by hand strips it and breaks the upload.
export async function apiUploadStudentImport(
  accessToken: string,
  form: FormData,
): Promise<StudentImportPreview> {
  const response = await fetch(`${API_URL}/students/bulk`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
    cache: 'no-store',
  });
  return handleResponse<StudentImportPreview>(response);
}

export async function apiConfirmStudentImport(
  accessToken: string,
  batchId: string,
): Promise<StudentImportResult> {
  const response = await fetch(`${API_URL}/students/bulk/${batchId}/confirm`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return handleResponse<StudentImportResult>(response);
}

export async function apiGetStudentImportTemplate(accessToken: string): Promise<string> {
  const response = await fetch(`${API_URL}/students/bulk/template`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return handleCsvResponse(response);
}

export async function apiGetStudentImportErrors(
  accessToken: string,
  batchId: string,
): Promise<string> {
  const response = await fetch(`${API_URL}/students/bulk/${batchId}/errors`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return handleCsvResponse(response);
}
