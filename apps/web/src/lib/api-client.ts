import type {
  AuthUser,
  InvitePreview,
  DashboardStats,
  PlatformDashboardStats,
  EntitlementOverview,
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
  PlaybackToken,
  UpdateVideoInput,
  Video,
  VideoUploadTicket,
  CloneCurriculumSchemaInput,
  ContentNode,
  ContentTree,
  CreateContentNodeInput,
  CreateCurriculumInput,
  CreateCurriculumSchemaInput,
  Curriculum,
  CurriculumDetail,
  CurriculumSchema,
  ListCurriculaQuery,
  MoveContentNodeInput,
  UpdateContentNodeInput,
  UpdateCurriculumInput,
  UpdateCurriculumSchemaInput,
  ContentAudience,
  Document,
  AdminDocument,
  AdminDocumentDetail,
  DocumentDownload,
  DocumentUploadTicket,
  AcademicYear,
  AcademicYearInput,
  AcademicCalendarDetail,
  AcademicCalendarEntry,
  AcademicCalendarSetting,
  AcademicCalendarStatus,
  AcademicCalendarSummary,
  AcademicCalendarView,
  CalendarEntryInput,
  CalendarImportResult,
  CalendarPair,
  SchoolCalendarOverview,
  ViewAcademicCalendarQuery,
  BulkContentConfirmResult,
  BulkContentCreateResult,
  ConfirmBulkContentInput,
  CreateBulkContentInput,
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

export async function apiPreviewInvite(token: string): Promise<InvitePreview> {
  const response = await fetch(`${API_URL}/auth/invite?token=${encodeURIComponent(token)}`, {
    cache: 'no-store',
  });
  return handleResponse<InvitePreview>(response);
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

export async function apiGetPlatformDashboardStats(
  accessToken: string,
): Promise<PlatformDashboardStats> {
  const response = await fetch(`${API_URL}/admin/platform-stats`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return handleResponse<PlatformDashboardStats>(response);
}

export async function apiGetEntitlementOverview(
  accessToken: string,
): Promise<EntitlementOverview> {
  const response = await fetch(`${API_URL}/admin/entitlements/overview`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return handleResponse<EntitlementOverview>(response);
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
  adminPassword?: string;
  sendInvite?: boolean;
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

export async function apiResendUserInvite(accessToken: string, id: string): Promise<void> {
  const response = await fetch(`${API_URL}/users/${id}/resend-invite`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new ApiError(response.status, body.message ?? 'Request failed');
  }
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
  input: { sendCredentialsEmail?: boolean } = {},
): Promise<TeacherImportResult> {
  const response = await fetch(`${API_URL}/teachers/bulk/${batchId}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
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
  // Where the video sits in the curriculum tree. The grade level and subject are implied
  // by the node's curriculum, so neither is sent — passing them would be a second,
  // contradictable source of truth for the entitlement key.
  contentNodeId: string;
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
  curriculumId: string,
): Promise<ContentImpact> {
  const params = new URLSearchParams({ curriculumId });
  const response = await fetch(`${API_URL}/admin/content-impact?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return handleResponse<ContentImpact>(response);
}

// SCHOOL_ADMIN, TEACHER and STUDENT (SUPER_ADMIN uses /admin/videos). The API
// returns just the READY videos the school's entitlements allow, narrowed further for a
// student to their enrolled grade level. A bare array — this endpoint is not paginated.
export async function apiListVideos(accessToken: string): Promise<Video[]> {
  const response = await fetch(`${API_URL}/videos`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return handleResponse<Video[]>(response);
}

// 404 covers both "no such video" and "not entitled" — the API never distinguishes them.
export async function apiGetVideo(accessToken: string, id: string): Promise<Video> {
  const response = await fetch(`${API_URL}/videos/${id}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return handleResponse<Video>(response);
}

// All roles may mint; tenant roles are re-checked against their content scope every time.
export async function apiGetPlaybackToken(
  accessToken: string,
  id: string,
): Promise<PlaybackToken> {
  const response = await fetch(`${API_URL}/videos/${id}/playback-token`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return handleResponse<PlaybackToken>(response);
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
  gradeLevelId?: string;
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
  // One curriculum is the whole (gradeLevel, subject) tree, and the licensing unit.
  curriculumId: string;
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

// Batch save for the checkbox-matrix admin UI: replaces the school's entire entitlement
// set in one call instead of one grant/revoke round-trip per curriculum.
export async function apiReplaceSchoolEntitlements(
  accessToken: string,
  schoolId: string,
  curriculumIds: string[],
  audience?: ContentAudience,
): Promise<Entitlement[]> {
  const response = await fetch(`${API_URL}/admin/schools/${schoolId}/entitlements`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ curriculumIds, audience }),
    cache: 'no-store',
  });
  return handleResponse<Entitlement[]>(response);
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
  sectionId?: string;
  password?: string;
  sendCredentialsEmail?: boolean;
}

export interface CreateTeacherInput {
  firstName: string;
  lastName: string;
  email: string;
  assignments?: Array<{ subjectId: string; gradeLevelId?: string }>;
  password?: string;
  sendCredentialsEmail?: boolean;
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

export interface AddStudentEnrollmentInput {
  sectionId: string;
  rollNumber?: string;
}

// Adds a class alongside the student's existing ones; it never moves them out of their
// current class. 409 if they are already in that section or the roll number is taken.
export async function apiAddStudentEnrollment(
  accessToken: string,
  studentId: string,
  input: AddStudentEnrollmentInput,
): Promise<Student> {
  const response = await fetch(`${API_URL}/students/${studentId}/enrollments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return handleResponse<Student>(response);
}

export async function apiUpdateStudentEnrollment(
  accessToken: string,
  studentId: string,
  enrollmentId: string,
  input: { rollNumber: string },
): Promise<Student> {
  const response = await fetch(`${API_URL}/students/${studentId}/enrollments/${enrollmentId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return handleResponse<Student>(response);
}

// 204 No Content on success, so this can't go through handleResponse.
export async function apiRemoveStudentEnrollment(
  accessToken: string,
  studentId: string,
  enrollmentId: string,
): Promise<void> {
  const response = await fetch(`${API_URL}/students/${studentId}/enrollments/${enrollmentId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new ApiError(response.status, body.message ?? 'Request failed');
  }
}

export async function apiGetTeacherPassword(accessToken: string, id: string): Promise<{ password: string | null }> {
  const response = await fetch(`${API_URL}/teachers/${id}/password`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return handleResponse<{ password: string | null }>(response);
}

export async function apiSetTeacherPassword(
  accessToken: string,
  id: string,
  password?: string,
): Promise<{ password: string }> {
  const response = await fetch(`${API_URL}/teachers/${id}/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ password }),
    cache: 'no-store',
  });
  return handleResponse<{ password: string }>(response);
}

export async function apiGetStudentPassword(accessToken: string, id: string): Promise<{ password: string | null }> {
  const response = await fetch(`${API_URL}/students/${id}/password`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return handleResponse<{ password: string | null }>(response);
}

export async function apiSetStudentPassword(
  accessToken: string,
  id: string,
  password?: string,
): Promise<{ password: string }> {
  const response = await fetch(`${API_URL}/students/${id}/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ password }),
    cache: 'no-store',
  });
  return handleResponse<{ password: string }>(response);
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
  input: { sendCredentialsEmail?: boolean } = {},
): Promise<StudentImportResult> {
  const response = await fetch(`${API_URL}/students/bulk/${batchId}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
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

// ---------------------------------------------------------------------------
// Curriculum structure — the configurable hierarchy below the grade/subject spine.
//
// Authoring (/admin/*) is SUPER_ADMIN only. The two school-facing reads at the bottom are
// SCHOOL_ADMIN/TEACHER/STUDENT only, matching /videos exactly.
// ---------------------------------------------------------------------------

export async function apiListCurriculumSchemas(accessToken: string): Promise<CurriculumSchema[]> {
  const response = await fetch(`${API_URL}/admin/curriculum-schemas`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return handleResponse<CurriculumSchema[]>(response);
}

export async function apiGetCurriculumSchema(
  accessToken: string,
  id: string,
): Promise<CurriculumSchema> {
  const response = await fetch(`${API_URL}/admin/curriculum-schemas/${id}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return handleResponse<CurriculumSchema>(response);
}

export async function apiCreateCurriculumSchema(
  accessToken: string,
  input: CreateCurriculumSchemaInput,
): Promise<CurriculumSchema> {
  const response = await fetch(`${API_URL}/admin/curriculum-schemas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return handleResponse<CurriculumSchema>(response);
}

export async function apiCloneCurriculumSchema(
  accessToken: string,
  id: string,
  input: CloneCurriculumSchemaInput,
): Promise<CurriculumSchema> {
  const response = await fetch(`${API_URL}/admin/curriculum-schemas/${id}/clone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return handleResponse<CurriculumSchema>(response);
}

export async function apiUpdateCurriculumSchema(
  accessToken: string,
  id: string,
  input: UpdateCurriculumSchemaInput,
): Promise<CurriculumSchema> {
  const response = await fetch(`${API_URL}/admin/curriculum-schemas/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return handleResponse<CurriculumSchema>(response);
}

// 204 No Content on success, so this can't go through handleResponse — response.json()
// would throw on an empty body.
export async function apiDeleteCurriculumSchema(accessToken: string, id: string): Promise<void> {
  const response = await fetch(`${API_URL}/admin/curriculum-schemas/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new ApiError(response.status, body.message ?? 'Request failed');
  }
}

export async function apiListCurricula(
  accessToken: string,
  query: ListCurriculaQuery = {},
): Promise<PaginatedResponse<Curriculum>> {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  if (query.gradeLevelId) params.set('gradeLevelId', query.gradeLevelId);
  if (query.subjectId) params.set('subjectId', query.subjectId);
  if (query.status) params.set('status', query.status);
  if (query.audience) params.set('audience', query.audience);

  const response = await fetch(`${API_URL}/admin/curricula?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return handleResponse<PaginatedResponse<Curriculum>>(response);
}

export async function apiGetCurriculum(accessToken: string, id: string): Promise<CurriculumDetail> {
  const response = await fetch(`${API_URL}/admin/curricula/${id}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return handleResponse<CurriculumDetail>(response);
}

// The builder view: every node and every video, whatever the publication state.
export async function apiGetAdminCurriculumTree(
  accessToken: string,
  id: string,
): Promise<ContentTree> {
  const response = await fetch(`${API_URL}/admin/curricula/${id}/tree`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return handleResponse<ContentTree>(response);
}

export async function apiCreateCurriculum(
  accessToken: string,
  input: CreateCurriculumInput,
): Promise<CurriculumDetail> {
  const response = await fetch(`${API_URL}/admin/curricula`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return handleResponse<CurriculumDetail>(response);
}

export async function apiUpdateCurriculum(
  accessToken: string,
  id: string,
  input: UpdateCurriculumInput,
): Promise<CurriculumDetail> {
  const response = await fetch(`${API_URL}/admin/curricula/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return handleResponse<CurriculumDetail>(response);
}

// Publishing and unpublishing take effect immediately for every entitled school, which is
// why they are their own endpoints rather than a status on the PATCH body.
export async function apiPublishCurriculum(
  accessToken: string,
  id: string,
): Promise<CurriculumDetail> {
  const response = await fetch(`${API_URL}/admin/curricula/${id}/publish`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return handleResponse<CurriculumDetail>(response);
}

export async function apiUnpublishCurriculum(
  accessToken: string,
  id: string,
): Promise<CurriculumDetail> {
  const response = await fetch(`${API_URL}/admin/curricula/${id}/unpublish`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return handleResponse<CurriculumDetail>(response);
}

export async function apiDeleteCurriculum(accessToken: string, id: string): Promise<void> {
  const response = await fetch(`${API_URL}/admin/curricula/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new ApiError(response.status, body.message ?? 'Request failed');
  }
}

// Nested under the curriculum because a node cannot exist without one, and the curriculum
// supplies the schema the new node's depth is checked against.
export async function apiCreateContentNode(
  accessToken: string,
  curriculumId: string,
  input: CreateContentNodeInput,
): Promise<ContentNode> {
  const response = await fetch(`${API_URL}/admin/curricula/${curriculumId}/nodes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return handleResponse<ContentNode>(response);
}

export async function apiUpdateContentNode(
  accessToken: string,
  id: string,
  input: UpdateContentNodeInput,
): Promise<ContentNode> {
  const response = await fetch(`${API_URL}/admin/content-nodes/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return handleResponse<ContentNode>(response);
}

// Reparent and reorder in one call — the same gesture in the builder, so splitting them
// would let the UI leave the tree half-moved between two requests.
export async function apiMoveContentNode(
  accessToken: string,
  id: string,
  input: MoveContentNodeInput,
): Promise<ContentNode> {
  const response = await fetch(`${API_URL}/admin/content-nodes/${id}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return handleResponse<ContentNode>(response);
}

export async function apiDeleteContentNode(accessToken: string, id: string): Promise<void> {
  const response = await fetch(`${API_URL}/admin/content-nodes/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new ApiError(response.status, body.message ?? 'Request failed');
  }
}

// SCHOOL_ADMIN, TEACHER and STUDENT. The API returns just the published curricula the school is
// entitled to, narrowed further for a student to their enrolled grade level.
export async function apiListMyCurricula(
  accessToken: string,
  audience?: ContentAudience,
): Promise<Curriculum[]> {
  const params = audience ? `?audience=${encodeURIComponent(audience)}` : '';
  const response = await fetch(`${API_URL}/curricula${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return handleResponse<Curriculum[]>(response);
}

export interface ListAdminDocumentsQuery {
  status?: string;
  gradeLevelId?: string;
  subjectId?: string;
  curriculumId?: string;
  contentNodeId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateDocumentInput {
  title: string;
  description?: string;
  contentNodeId: string;
  contentType: string;
  sizeBytes: number;
}

export async function apiListDocuments(accessToken: string): Promise<Document[]> {
  const response = await fetch(`${API_URL}/documents`, {
    headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store',
  });
  return handleResponse<Document[]>(response);
}

export async function apiGetDocument(accessToken: string, id: string): Promise<Document> {
  const response = await fetch(`${API_URL}/documents/${id}`, {
    headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store',
  });
  return handleResponse<Document>(response);
}

export async function apiGetDocumentDownload(
  accessToken: string,
  id: string,
): Promise<DocumentDownload> {
  const response = await fetch(`${API_URL}/documents/${id}/download`, {
    headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store',
  });
  return handleResponse<DocumentDownload>(response);
}

export async function apiListAdminDocuments(
  accessToken: string,
  query: ListAdminDocumentsQuery = {},
): Promise<PaginatedResponse<AdminDocument>> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined) params.set(key, String(value));
  const response = await fetch(`${API_URL}/admin/documents?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store',
  });
  return handleResponse<PaginatedResponse<AdminDocument>>(response);
}

export async function apiGetAdminDocument(accessToken: string, id: string): Promise<AdminDocumentDetail> {
  const response = await fetch(`${API_URL}/admin/documents/${id}`, {
    headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store',
  });
  return handleResponse<AdminDocumentDetail>(response);
}

export async function apiGetAdminDocumentDownload(
  accessToken: string,
  id: string,
): Promise<DocumentDownload> {
  const response = await fetch(`${API_URL}/admin/documents/${id}/download`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return handleResponse<DocumentDownload>(response);
}

export async function apiCreateDocument(
  accessToken: string,
  input: CreateDocumentInput,
): Promise<DocumentUploadTicket> {
  const response = await fetch(`${API_URL}/admin/documents`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input), cache: 'no-store',
  });
  return handleResponse<DocumentUploadTicket>(response);
}

export async function apiCreateBulkContent(
  accessToken: string,
  input: CreateBulkContentInput,
): Promise<BulkContentCreateResult> {
  const response = await fetch(`${API_URL}/admin/content/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return handleResponse<BulkContentCreateResult>(response);
}

export async function apiConfirmBulkContent(
  accessToken: string,
  input: ConfirmBulkContentInput,
): Promise<BulkContentConfirmResult> {
  const response = await fetch(`${API_URL}/admin/content/bulk/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return handleResponse<BulkContentConfirmResult>(response);
}

export async function apiCreateDocumentUploadUrl(
  accessToken: string,
  id: string,
  input: { contentType: string; sizeBytes: number },
): Promise<DocumentUploadTicket> {
  const response = await fetch(`${API_URL}/admin/documents/${id}/upload-url`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input), cache: 'no-store',
  });
  return handleResponse<DocumentUploadTicket>(response);
}

export async function apiConfirmDocumentUpload(accessToken: string, id: string): Promise<AdminDocument> {
  const response = await fetch(`${API_URL}/admin/documents/${id}/uploaded`, {
    method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store',
  });
  return handleResponse<AdminDocument>(response);
}

export async function apiUpdateDocument(
  accessToken: string,
  id: string,
  input: { title?: string; description?: string; contentNodeId?: string },
): Promise<AdminDocumentDetail> {
  const response = await fetch(`${API_URL}/admin/documents/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input), cache: 'no-store',
  });
  return handleResponse<AdminDocumentDetail>(response);
}

export async function apiDeleteDocument(accessToken: string, id: string): Promise<void> {
  const response = await fetch(`${API_URL}/admin/documents/${id}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store',
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new ApiError(response.status, body.message ?? 'Request failed');
  }
}

// 404 covers "no such curriculum", "not entitled" and "not published" alike — the API
// never distinguishes them.
export async function apiGetCurriculumTree(accessToken: string, id: string): Promise<ContentTree> {
  const response = await fetch(`${API_URL}/curricula/${id}/tree`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  return handleResponse<ContentTree>(response);
}

// ---------------------------------------------------------------------------
// Academic calendar
// ---------------------------------------------------------------------------

// A platform default (SUPER_ADMIN) and a school's own calendar (SCHOOL_ADMIN) share one
// API shape under different roots, so the editor is written once against either.
export type CalendarKind = 'platform' | 'school';

const CALENDAR_ROOT: Record<CalendarKind, string> = {
  platform: '/admin/academic-calendars',
  school: '/school-academic-calendars',
};

async function handleNoContent(response: Response): Promise<void> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new ApiError(response.status, body.message ?? 'Request failed');
  }
}

function authed(accessToken: string, method = 'GET', body?: unknown): RequestInit {
  return {
    method,
    headers:
      body === undefined
        ? { Authorization: `Bearer ${accessToken}` }
        : { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  };
}

export async function apiListAcademicYears(accessToken: string): Promise<AcademicYear[]> {
  const response = await fetch(`${API_URL}/academic-years`, authed(accessToken));
  return handleResponse<AcademicYear[]>(response);
}

export async function apiCreateAcademicYear(
  accessToken: string,
  input: AcademicYearInput,
): Promise<AcademicYear> {
  const response = await fetch(`${API_URL}/admin/academic-years`, authed(accessToken, 'POST', input));
  return handleResponse<AcademicYear>(response);
}

export async function apiUpdateAcademicYear(
  accessToken: string,
  id: string,
  input: Partial<AcademicYearInput>,
): Promise<AcademicYear> {
  const response = await fetch(`${API_URL}/admin/academic-years/${id}`, authed(accessToken, 'PATCH', input));
  return handleResponse<AcademicYear>(response);
}

export async function apiDeleteAcademicYear(accessToken: string, id: string): Promise<void> {
  const response = await fetch(`${API_URL}/admin/academic-years/${id}`, authed(accessToken, 'DELETE'));
  return handleNoContent(response);
}

export async function apiListPlatformCalendars(
  accessToken: string,
  query: {
    academicYearId?: string;
    gradeLevelId?: string;
    subjectId?: string;
    status?: AcademicCalendarStatus;
  } = {},
): Promise<AcademicCalendarSummary[]> {
  const params = new URLSearchParams();
  if (query.academicYearId) params.set('academicYearId', query.academicYearId);
  if (query.gradeLevelId) params.set('gradeLevelId', query.gradeLevelId);
  if (query.subjectId) params.set('subjectId', query.subjectId);
  if (query.status) params.set('status', query.status);
  const response = await fetch(`${API_URL}/admin/academic-calendars?${params}`, authed(accessToken));
  return handleResponse<AcademicCalendarSummary[]>(response);
}

export async function apiCreatePlatformCalendar(
  accessToken: string,
  input: { academicYearId: string; gradeLevelId: string; subjectId: string },
): Promise<AcademicCalendarDetail> {
  const response = await fetch(`${API_URL}/admin/academic-calendars`, authed(accessToken, 'POST', input));
  return handleResponse<AcademicCalendarDetail>(response);
}

export async function apiGetSchoolCalendarOverview(
  accessToken: string,
  academicYearId: string,
): Promise<SchoolCalendarOverview> {
  const params = new URLSearchParams({ academicYearId });
  const response = await fetch(`${API_URL}/school-academic-calendars?${params}`, authed(accessToken));
  return handleResponse<SchoolCalendarOverview>(response);
}

export async function apiCreateSchoolCalendar(
  accessToken: string,
  input: { academicYearId: string; gradeLevelId: string; subjectId: string; copyFromDefault?: boolean },
): Promise<AcademicCalendarDetail> {
  const response = await fetch(`${API_URL}/school-academic-calendars`, authed(accessToken, 'POST', input));
  return handleResponse<AcademicCalendarDetail>(response);
}

export async function apiGetCalendar(
  accessToken: string,
  kind: CalendarKind,
  id: string,
): Promise<AcademicCalendarDetail> {
  const response = await fetch(`${API_URL}${CALENDAR_ROOT[kind]}/${id}`, authed(accessToken));
  return handleResponse<AcademicCalendarDetail>(response);
}

// Publishing a default reaches every entitled school at once; publishing a school's own
// calendar replaces the default for that school. Both take effect immediately.
export async function apiSetCalendarPublished(
  accessToken: string,
  kind: CalendarKind,
  id: string,
  isPublished: boolean,
): Promise<AcademicCalendarDetail> {
  const action = isPublished ? 'publish' : 'unpublish';
  const response = await fetch(
    `${API_URL}${CALENDAR_ROOT[kind]}/${id}/${action}`,
    authed(accessToken, 'POST'),
  );
  return handleResponse<AcademicCalendarDetail>(response);
}

export async function apiDeleteCalendar(accessToken: string, kind: CalendarKind, id: string): Promise<void> {
  const response = await fetch(`${API_URL}${CALENDAR_ROOT[kind]}/${id}`, authed(accessToken, 'DELETE'));
  return handleNoContent(response);
}

export async function apiAddCalendarEntry(
  accessToken: string,
  kind: CalendarKind,
  id: string,
  input: CalendarEntryInput,
): Promise<AcademicCalendarEntry> {
  const response = await fetch(
    `${API_URL}${CALENDAR_ROOT[kind]}/${id}/entries`,
    authed(accessToken, 'POST', input),
  );
  return handleResponse<AcademicCalendarEntry>(response);
}

export async function apiUpdateCalendarEntry(
  accessToken: string,
  kind: CalendarKind,
  id: string,
  entryId: string,
  input: Partial<CalendarEntryInput>,
): Promise<AcademicCalendarEntry> {
  const response = await fetch(
    `${API_URL}${CALENDAR_ROOT[kind]}/${id}/entries/${entryId}`,
    authed(accessToken, 'PATCH', input),
  );
  return handleResponse<AcademicCalendarEntry>(response);
}

export async function apiDeleteCalendarEntry(
  accessToken: string,
  kind: CalendarKind,
  id: string,
  entryId: string,
): Promise<void> {
  const response = await fetch(
    `${API_URL}${CALENDAR_ROOT[kind]}/${id}/entries/${entryId}`,
    authed(accessToken, 'DELETE'),
  );
  return handleNoContent(response);
}

export async function apiListCalendarSettings(accessToken: string): Promise<AcademicCalendarSetting[]> {
  const response = await fetch(`${API_URL}/academic-calendar-settings`, authed(accessToken));
  return handleResponse<AcademicCalendarSetting[]>(response);
}

export async function apiUpdateCalendarSetting(
  accessToken: string,
  academicYearId: string,
  isEnabled: boolean,
): Promise<AcademicCalendarSetting> {
  const response = await fetch(
    `${API_URL}/academic-calendar-settings/${academicYearId}`,
    authed(accessToken, 'PUT', { isEnabled }),
  );
  return handleResponse<AcademicCalendarSetting>(response);
}

export async function apiViewAcademicCalendar(
  accessToken: string,
  query: ViewAcademicCalendarQuery,
): Promise<AcademicCalendarView> {
  const params = new URLSearchParams();
  if (query.academicYearId) params.set('academicYearId', query.academicYearId);
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (query.gradeLevelId) params.set('gradeLevelId', query.gradeLevelId);
  if (query.subjectId) params.set('subjectId', query.subjectId);
  const response = await fetch(`${API_URL}/academic-calendar?${params}`, authed(accessToken));
  return handleResponse<AcademicCalendarView>(response);
}

export async function apiListCalendarPairs(accessToken: string): Promise<CalendarPair[]> {
  const response = await fetch(`${API_URL}/academic-calendar/subjects`, authed(accessToken));
  return handleResponse<CalendarPair[]>(response);
}

// No Content-Type header: undici derives the multipart boundary from the FormData.
// The form carries `file`, and optionally `dryRun` / `replaceExisting` as 'true'.
export async function apiImportCalendarEntries(
  accessToken: string,
  kind: CalendarKind,
  id: string,
  form: FormData,
): Promise<CalendarImportResult> {
  const response = await fetch(`${API_URL}${CALENDAR_ROOT[kind]}/${id}/entries/import`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
    cache: 'no-store',
  });
  return handleResponse<CalendarImportResult>(response);
}

export async function apiGetCalendarImportTemplate(
  accessToken: string,
  kind: CalendarKind,
  id: string,
): Promise<ArrayBuffer> {
  const response = await fetch(`${API_URL}${CALENDAR_ROOT[kind]}/${id}/entries/import-template`, authed(accessToken));
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new ApiError(response.status, body.message ?? 'Request failed');
  }
  return response.arrayBuffer();
}
