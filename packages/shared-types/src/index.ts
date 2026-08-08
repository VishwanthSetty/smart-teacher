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

// Mirrors the `VideoStatus` enum in apps/api/prisma/schema.prisma.
export enum VideoStatus {
  UPLOADING = 'UPLOADING',
  QUEUED = 'QUEUED',
  // A worker has leased the job and reported in. Distinct from QUEUED so "nobody ever
  // picked this up" and "someone picked it up and died" read differently in the library.
  PROCESSING = 'PROCESSING',
  READY = 'READY',
  FAILED = 'FAILED',
}

// Mirrors apps/api/src/videos/video-ingest.constants.ts, the enforcing copy. Kept in
// sync by hand like the enums above — the API deliberately does not depend on this
// package. These let the upload form reject a file before a request is made; they are a
// convenience, never the check that matters.
export const ACCEPTED_VIDEO_CONTENT_TYPES = ['video/mp4', 'video/quicktime'] as const;
export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

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

// Mirrors the `TeacherImportBatchStatus` enum in apps/api/prisma/schema.prisma.
export enum TeacherImportBatchStatus {
  DRAFT = 'DRAFT',
  COMMITTED = 'COMMITTED',
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
  activatedAt: string | null;
  createdAt: string;
}

// The platform-wide grade level a section is pinned to — mirrors GradeLevel in
// apps/api/prisma/schema.prisma.
export interface GradeLevel {
  id: string;
  name: string;
  rank: number;
}

// Mirrors the `CurriculumStatus` enum in apps/api/prisma/schema.prisma.
export enum CurriculumStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}

// One level in a curriculum's vocabulary. `depth` is 1-based and counted below the
// grade/subject spine, so depth 1 is the first authored level (typically "Chapter").
export interface CurriculumLevel {
  id: string;
  depth: number;
  name: string;
  canHoldContent: boolean;
}

// A reusable, ordered level vocabulary — "Chapter -> Topic", "Unit -> Experiment -> Step".
// This is what makes the hierarchy configurable: a schema is authored once and bound by
// many curricula, so per-grade and per-subject variation does not become one bespoke
// config blob per curriculum.
export interface CurriculumSchema {
  id: string;
  name: string;
  code: string;
  description: string | null;
  levels: CurriculumLevel[];
  curriculumCount: number;
}

// One row per (gradeLevel, subject) on the platform: the licensing unit every
// entitlement points at, the root of the content tree, and where the level vocabulary is
// bound.
export interface Curriculum {
  id: string;
  gradeLevelId: string;
  gradeLevelName: string;
  subjectId: string;
  subjectName: string;
  schemaId: string;
  schemaName: string;
  status: CurriculumStatus;
  publishedAt: string | null;
  nodeCount: number;
  videoCount: number;
}

// The builder's view: everything in Curriculum plus the level vocabulary, so the UI can
// label its "Add <level>" buttons from the configuration rather than hard-coding them.
export interface CurriculumDetail extends Curriculum {
  levels: CurriculumLevel[];
  entitledSchoolCount: number;
}

export interface ContentNode {
  id: string;
  curriculumId: string;
  parentId: string | null;
  depth: number;
  // Resolved server-side from the curriculum's schema, so a client never joins the schema
  // itself to render a label.
  levelName: string;
  canHoldContent: boolean;
  code: string;
  title: string;
  description: string | null;
  sortOrder: number;
}

export interface ContentTreeVideo {
  id: string;
  title: string;
  description: string | null;
  durationSecs: number | null;
  // Present in the SUPER_ADMIN builder tree. School-facing trees contain READY videos
  // only, so they do not need to expose ingest state.
  status?: VideoStatus;
}

export interface ContentTreeNode extends ContentNode {
  children: ContentTreeNode[];
  videos: ContentTreeVideo[];
  // Videos in this node AND everything beneath it, so an empty branch can be hidden
  // without walking the subtree.
  videoCountDeep: number;
}

export interface ContentTree {
  curriculumId: string;
  gradeLevelId: string;
  gradeLevelName: string;
  subjectId: string;
  subjectName: string;
  status: CurriculumStatus;
  nodes: ContentTreeNode[];
}

export interface CreateCurriculumSchemaInput {
  name: string;
  code: string;
  description?: string;
  levels: Array<Omit<CurriculumLevel, 'id'>>;
}

export interface UpdateCurriculumSchemaInput {
  name?: string;
  description?: string;
  // Supplying levels replaces the whole set. The API refuses to drop a depth any
  // curriculum still has nodes at.
  levels?: Array<Omit<CurriculumLevel, 'id'>>;
}

export interface CloneCurriculumSchemaInput {
  name: string;
  code: string;
}

export interface CreateCurriculumInput {
  gradeLevelId: string;
  subjectId: string;
  schemaId: string;
}

export interface UpdateCurriculumInput {
  schemaId?: string;
  // Only ARCHIVED and DRAFT are settable; publishing goes through its own endpoint.
  status?: CurriculumStatus;
}

export interface ListCurriculaQuery {
  gradeLevelId?: string;
  subjectId?: string;
  status?: CurriculumStatus;
  page?: number;
  limit?: number;
}

export interface CreateContentNodeInput {
  parentId: string | null;
  code: string;
  title: string;
  description?: string;
}

export interface UpdateContentNodeInput {
  code?: string;
  title?: string;
  description?: string;
}

// Reparent and reorder in one call: they are the same gesture in the builder, and
// splitting them would let a UI leave the tree half-moved between two requests.
export interface MoveContentNodeInput {
  parentId: string | null;
  position: number;
}

// What a teacher or student sees. Only READY videos ever reach this shape, which is why
// it carries no status: the school-facing library has no concept of an in-flight upload.
export interface Video {
  id: string;
  title: string;
  description: string | null;
  durationSecs: number | null;
  contentNodeId: string;
  contentNodeTitle: string;
  curriculumId: string;
  // Denormalized off the node's curriculum so a flat list can label itself without a
  // second round trip. The entitlement decision keys on curriculumId alone.
  gradeLevelId: string;
  subjectId: string;
}

// The Super Admin library-management view, which does see the ingest lifecycle.
// `sourceKey` is deliberately absent — it is an internal bucket path.
export interface AdminVideo {
  id: string;
  title: string;
  description: string | null;
  status: VideoStatus;
  durationSecs: number | null;
  sizeBytes: number | null;
  contentType: string | null;
  contentNodeId: string;
  contentNodeTitle: string;
  curriculumId: string;
  // Denormalized off the node's curriculum for display in the admin library grid.
  gradeLevelId: string;
  subjectId: string;
  // Why the last transcode attempt failed, in words an admin can act on. Null unless FAILED.
  failureReason: string | null;
  createdAt: string;
}

export interface VideoRendition {
  id: string;
  name: string;
  width: number;
  height: number;
  bitrateKbps: number;
  playlistKey: string;
}

export interface AdminVideoDetail extends AdminVideo {
  updatedAt: string;
  transcodeAttempts: number;
  transcodeStartedAt: string | null;
  retainSource: boolean | null;
  sourceKey: string | null;
  playlistKey: string | null;
  posterKey: string | null;
  renditions: VideoRendition[];
}

export interface PlaybackToken {
  videoId: string;
  manifestUrl: string;
  posterUrl: string | null;
  durationSecs: number | null;
  expiresInSecs: number;
}

export interface ContentImpact {
  curriculumId: string;
  gradeLevelId: string;
  subjectId: string;
  schoolCount: number;
  studentCount: number;
  videoCount: number;
}

export interface UpdateVideoInput {
  title?: string;
  description?: string;
  // Re-filing a video moves it anywhere in the tree, including into another curriculum —
  // which changes which schools can see it, so the API re-validates the destination.
  contentNodeId?: string;
  retainSource?: boolean | null;
}

export interface ListAdminVideosQuery {
  status?: VideoStatus;
  // Grade level and subject remain useful filters even though a video no longer carries
  // them — they resolve through the node's curriculum.
  gradeLevelId?: string;
  subjectId?: string;
  curriculumId?: string;
  contentNodeId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

// A created (or retried) video plus the one-shot capability to upload its source. The
// URL is short-lived and scoped to a single object key — hand it to the browser, never
// persist it.
export interface VideoUploadTicket {
  video: AdminVideo;
  uploadUrl: string;
  expiresInSecs: number;
}

// Mirrors the `EnrollmentStatus` enum in apps/api/prisma/schema.prisma.
export enum EnrollmentStatus {
  ACTIVE = 'ACTIVE',
  ENDED = 'ENDED',
}

export interface Section {
  id: string;
  name: string;
  gradeLevelId: string;
  gradeLevelName: string;
  label: string;
  studentCount: number;
}

// Mirrors TeacherAssignmentEntity in apps/api/src/teachers/entities/teacher-assignment.entity.ts.
// sectionId/sectionName/gradeLevelId/gradeLevelName/sectionLabel are all null together for
// a school-wide "teaches this subject" grant (the shape the teacher CSV import produces).
export interface TeacherAssignment {
  id: string;
  teacherId: string;
  teacherName: string;
  teacherEmail: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  sectionId: string | null;
  sectionName: string | null;
  gradeLevelId: string | null;
  gradeLevelName: string | null;
  sectionLabel: string | null;
  createdAt: string;
}

// Mirrors EntitlementEntity in apps/api/src/entitlements/entities/entitlement.entity.ts.
// One row is a school's licence to reach a whole curriculum — the unit
// ActorContentScopeService resolves every content read against.
export interface Entitlement {
  id: string;
  schoolId: string;
  curriculumId: string;
  // Denormalized off the curriculum for display. The grant is keyed on curriculumId alone.
  gradeLevelId: string;
  gradeLevelName: string;
  subjectId: string;
  subjectName: string;
  // A grant may legitimately precede publication, so an operator needs to see that a
  // granted curriculum is not yet reaching the school.
  curriculumStatus: CurriculumStatus;
  grantedAt: string;
}

export interface StudentEnrollment {
  id: string;
  sectionId: string;
  sectionName: string;
  gradeLevelId: string;
  gradeLevelName: string;
  rollNumber: string | null;
}

export interface Student {
  password?: string;
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  name: string;
  status: UserStatus;
  activatedAt: string | null;
  createdAt: string;
  enrollment: StudentEnrollment | null;
}

export interface TeacherSubject {
  id: string;
  name: string;
  code: string;
}

// Mirrors TeacherEntity in apps/api/src/teachers/entities/teacher.entity.ts.
export interface Teacher {
  password?: string;
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  name: string;
  status: UserStatus;
  activatedAt: string | null;
  createdAt: string;
  subjects: TeacherSubject[];
}

// Duplicate-within-the-file and duplicate-against-existing-records are deliberately
// separate codes: they are the same symptom with different fixes, and the admin needs
// to be able to tell them apart in the error report.
export type TeacherImportErrorCode =
  | 'MISSING_EMAIL'
  | 'INVALID_EMAIL'
  | 'MISSING_NAME'
  | 'NAME_TOO_LONG'
  | 'DUPLICATE_IN_FILE'
  | 'DUPLICATE_EXISTING'
  | 'UNKNOWN_SUBJECT'
  | 'RETIRED_SUBJECT'
  | 'PASSWORD_TOO_SHORT'
  | 'PASSWORD_TOO_LONG'
  | 'PASSWORD_MATCHES_EMAIL';

export interface TeacherImportRowIssue {
  code: TeacherImportErrorCode;
  message: string;
}

export interface TeacherImportRowError {
  // 1-based line number as a spreadsheet shows it — the header row is line 1.
  rowNumber: number;
  email: string;
  name: string;
  subjectCodes: string;
  errors: TeacherImportRowIssue[];
}

export interface TeacherImportRow {
  rowNumber: number;
  email: string;
  name: string;
  subjectCodes: string[];
  rawSubjectCodes: string;
  hasPassword: boolean;
}

// Non-blocking: the import still runs, but the admin is told what was ignored.
export interface TeacherImportWarning {
  code: 'EXTRA_COLUMNS';
  message: string;
}

export interface TeacherImportPreview {
  batchId: string;
  fileName: string;
  status: TeacherImportBatchStatus;
  totalRows: number;
  validCount: number;
  invalidCount: number;
  validRows: TeacherImportRow[];
  invalidRows: TeacherImportRowError[];
  warnings: TeacherImportWarning[];
  createdAt: string;
}

export interface TeacherImportResult {
  batchId: string;
  createdCount: number;
  skippedCount: number;
  emailsSent: number;
  emailsFailed: number;
  invalidRows: TeacherImportRowError[];
}

// Mirrors the `StudentImportBatchStatus` enum in apps/api/prisma/schema.prisma.
export enum StudentImportBatchStatus {
  DRAFT = 'DRAFT',
  COMMITTED = 'COMMITTED',
}

// Grade-level and section resolution failures are deliberately separate codes from each
// other (and from a generic "not found") so the admin knows which cell to fix.
export type StudentImportErrorCode =
  | 'MISSING_EMAIL'
  | 'INVALID_EMAIL'
  | 'MISSING_FIRST_NAME'
  | 'FIRST_NAME_TOO_LONG'
  | 'MISSING_LAST_NAME'
  | 'LAST_NAME_TOO_LONG'
  | 'MISSING_GRADE_LEVEL'
  | 'MISSING_SECTION'
  | 'ROLL_NUMBER_TOO_LONG'
  | 'DUPLICATE_IN_FILE'
  | 'DUPLICATE_ROLL_IN_FILE'
  | 'DUPLICATE_EXISTING'
  | 'UNKNOWN_GRADE_LEVEL'
  | 'UNKNOWN_SECTION'
  | 'ROLL_NUMBER_TAKEN'
  | 'PASSWORD_TOO_SHORT'
  | 'PASSWORD_TOO_LONG'
  | 'PASSWORD_MATCHES_EMAIL';

export interface StudentImportRowIssue {
  code: StudentImportErrorCode;
  message: string;
}

export interface StudentImportRowError {
  // 1-based line number as a spreadsheet shows it — the header row is line 1.
  rowNumber: number;
  firstName: string;
  lastName: string;
  email: string;
  gradeLevel: string;
  section: string;
  rollNumber: string;
  errors: StudentImportRowIssue[];
}

export interface StudentImportRow {
  rowNumber: number;
  firstName: string;
  lastName: string;
  email: string;
  gradeLevel: string;
  section: string;
  rollNumber: string | null;
  hasPassword: boolean;
}

// Non-blocking: the import still runs, but the admin is told what was ignored.
export interface StudentImportWarning {
  code: 'EXTRA_COLUMNS';
  message: string;
}

export interface StudentImportPreview {
  batchId: string;
  fileName: string;
  status: StudentImportBatchStatus;
  totalRows: number;
  validCount: number;
  invalidCount: number;
  validRows: StudentImportRow[];
  invalidRows: StudentImportRowError[];
  warnings: StudentImportWarning[];
  createdAt: string;
}

export interface StudentImportResult {
  batchId: string;
  createdCount: number;
  skippedCount: number;
  emailsSent: number;
  emailsFailed: number;
  invalidRows: StudentImportRowError[];
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
