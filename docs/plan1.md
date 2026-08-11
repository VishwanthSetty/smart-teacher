# Teacher-facing content + teacher↔grade association

## Context

Today the platform has exactly one kind of content: pupil-facing videos. The chain is
`GradeLevel × Subject → Curriculum → ContentNode tree → Video`, where **`Curriculum` is the
licensing unit** — a school reaches content only through a `SchoolContentEntitlement` row
pointing at one curriculum.

Two gaps block teacher enablement:

1. **There is nowhere to put teacher material.** Teacher training videos, lesson-plan
   videos and lesson-plan PDFs have no home in the model, and there is no document/PDF
   concept anywhere in the codebase (API, worker, web or `shared-types`).
2. **Teachers are not associated with grades.** `TeacherAssignment` is
   `(schoolId, userId, subjectId, sectionId?)`. Grade is only *implied* via a section, and
   the two paths that create most rows — the teacher create form and the teacher CSV
   import — always leave `sectionId` null. Consequently `ActorContentScopeService` has no
   basis to narrow a teacher and falls through to the school's entire entitlement set
   (line 58, with the deferral written into its header comment).

**Outcome:** a teacher logs in and sees two tabs. *For My Students* — the student videos
for the grades and subjects they actually teach. *For Me* — teacher training videos,
lesson-plan videos and lesson-plan PDFs their school licensed, in the same tree structure.
A student can never reach teacher material.

## Decisions taken

| # | Decision |
|---|---|
| 1 | **Audience lives on `Curriculum`.** New enum `ContentAudience { STUDENT, TEACHER }`; `@@unique([gradeLevelId, subjectId])` → `@@unique([gradeLevelId, subjectId, audience])`. Grade 5 Maths STUDENT and Grade 5 Maths TEACHER are two curricula with separate trees, publish state and entitlements. |
| 2 | **Entitlement is per audience** — falls out for free, since grants key on `curriculumId`. The super-admin matrix gains a Students/Teachers tab. |
| 3 | **`TeacherAssignment` gains `gradeLevelId`** (nullable — see below). Derived from the section when one is given; they must agree. Teacher create form and CSV import start collecting it. |
| 4 | **Lenient fallback**: a teacher with *no* grade-bearing assignment keeps the school's full entitlement set. Narrowing begins with the first assignment an admin files. |
| 5 | **Teacher-audience content is never narrowed by assignment.** A teacher's scope = *(all entitled TEACHER curricula)* ∪ *(entitled STUDENT curricula matching their taught pairs)*. This is what keeps generic "Professional Development" material reachable. |
| 6 | **PDFs = new platform-global `Document` model**, `UPLOADING → READY \| FAILED`, verified at confirm via `statObject`, delivered as a short-lived presigned GET. No worker, no queue, no HLS, no playback JWT, **no new npm dependency**. |
| 7 | **Generic teacher training rides an ordinary `Subject`** (operator creates "Professional Development"). No grade-less curricula. |
| 8 | **Web**: `/dashboard/videos` gains a *For My Students* / *For Me* switch (`?audience=`), rendered for TEACHER + SCHOOL_ADMIN only. Same route, same grade→subject→tree flow. |
| 9 | **SCHOOL_ADMIN is not narrowed** — an admin teaches nothing, and narrowing them breaks the surface they use to verify what their school licensed. |

---

## Phase 1 — Schema + migration

**`apps/api/prisma/schema.prisma`** (no `@map`/`@@map` exists in this file — do not introduce any):

- New `enum ContentAudience { STUDENT TEACHER }` and `enum DocumentStatus { UPLOADING READY FAILED }`.
- `Curriculum` (:250) — add `audience ContentAudience @default(STUDENT)`; change the unique to
  `@@unique([gradeLevelId, subjectId, audience])`; add `@@index([audience, status])`, keep
  `@@index([status])` (`findAll` still filters status alone).
- `ContentNode` (:275) — add `documents Document[]` beside `videos Video[]`.
- New `Document` model after `VideoRendition`:

```prisma
model Document {
  id            String         @id @default(cuid())
  title         String
  description   String?
  status        DocumentStatus @default(UPLOADING)
  sourceKey     String?        @unique   // "documents/{id}/source.pdf"
  sizeBytes     Int?                     // VERIFIED at confirm time, never the declared value
  contentType   String?                  // ditto
  failureReason String?
  contentNodeId String
  node          ContentNode    @relation(fields: [contentNodeId], references: [id])
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt

  @@index([contentNodeId])
  @@index([status])
}
```
  No `retainSource`: for a document the source object *is* the artefact.

- `TeacherAssignment` (:449) — add `gradeLevelId String?` + `gradeLevel GradeLevel? @relation(..., onDelete: Restrict)` and `@@index([gradeLevelId])`. **`Restrict`, not Prisma's default `SetNull`** for an optional relation: `SetNull` would launder a grade-bearing row back into a grade-less one, which *widens* the teacher's scope.
- `GradeLevel` (:164) — add the `teacherAssignments TeacherAssignment[]` back-relation, carrying the same "never `include` this from a GradeLevel root" warning `sections` already has.
- **`SchoolContentEntitlement` is unchanged.**

**Why `gradeLevelId` is nullable.** Rows written before this column exists state no grade and
there is no correct value to invent. A NULL row keeps its old meaning ("qualified, grade
unstated") and, naming no grade, narrows nothing — which is precisely what makes decision 4's
lenient fallback expressible. Requiring the column would force the migration to delete or
fabricate, and would blank the library of every already-onboarded teacher.

**Migration** — `npx prisma migrate dev --create-only --name add_content_audience_documents_and_teacher_grade`, then hand-edit. Prisma generates the enums, the `audience` column with `DEFAULT 'STUDENT'`, the `Document` table, the `gradeLevelId` column + FK, and the `Curriculum` unique swap. Add by hand, because `@@unique` cannot express a `WHERE` and Postgres treats NULLs as distinct:

```sql
DROP INDEX "TeacherAssignment_schoolId_userId_subjectId_nosection_key";

-- legacy shape: no section, no grade. Meaning unchanged.
CREATE UNIQUE INDEX "TeacherAssignment_schoolId_userId_subjectId_bare_key"
  ON "TeacherAssignment"("schoolId","userId","subjectId")
  WHERE "sectionId" IS NULL AND "gradeLevelId" IS NULL;

-- grade-bearing, section-less. A teacher legitimately teaches Maths at Grade 5 AND Grade 6.
CREATE UNIQUE INDEX "TeacherAssignment_schoolId_userId_subjectId_gradeLevelId_key"
  ON "TeacherAssignment"("schoolId","userId","subjectId","gradeLevelId")
  WHERE "sectionId" IS NULL AND "gradeLevelId" IS NOT NULL;
```
The third index (`(sectionId, subjectId) WHERE sectionId IS NOT NULL`) is untouched — grade is derived from the section there, so adding it would constrain nothing new.

**Backfill:** existing curricula → `STUDENT` via the column default, no data script. Existing
`TeacherAssignment` rows → **left NULL deliberately**. Backfilling section-pinned rows from
`Section.gradeLevelId` is tempting but would silently narrow every section-pinned teacher on
deploy day — exactly what decision 4 protects against. It stays a one-line follow-up migration
if an operator ever wants it.

**`apps/api/src/prisma/tenant-scoped-models.ts`** — add `'Document'` to `PLATFORM_GLOBAL_MODELS`.
`tenant-model-coverage.spec.ts` fails the build otherwise.

**Also in this phase (or the build red-lights):** `apps/api/test/utils/content-fixtures.ts:112`
uses the compound key `gradeLevelId_subjectId` → becomes `gradeLevelId_subjectId_audience`.

---

## Phase 2 — The scope seam

**`entitlements/content-entitlements.service.ts`** — `EntitledCurriculum` gains `subjectId` and
`audience`; `listEntitledCurricula`'s nested select widens to
`curriculum: { select: { gradeLevelId: true, subjectId: true, audience: true } }`. Still a
to-one include of a platform-global model from a tenant-scoped root — the one shape the tenant
guard's walker allows. **Do not** invert it to `curriculum.findMany({ where: { entitlements: { some: {} } } })`;
this service's whole guarantee is that it never names a school.

**`teachers/teacher-assignments.service.ts`** — new seam method, the exact parallel to
`EnrollmentsService.activeGradeLevelIdFor`. `ActorContentScopeService` has no `PrismaService`
by design, so the query is owned by the feature that owns the table:

```ts
export interface TaughtPair { gradeLevelId: string; subjectId: string; }

async taughtPairsFor(userId: string): Promise<TaughtPair[]>
```
`findMany({ where: { userId, gradeLevelId: { not: null } }, select: { gradeLevelId, subjectId }, distinct: [...] })`,
then `flatMap` to narrow the type (no `!`, per CLAUDE.md). Root is tenant-scoped, select is
scalars only, no relation traversed. **Do not** reach the grade via `section` — the column is
denormalised onto the row now, and the two would quietly disagree if they ever diverged.
An empty result means "nobody has filed this teacher yet", which the caller treats as the
school-wide set on purpose.

**`entitlements/actor-content-scope.service.ts`** — inject `TeacherAssignmentsService`; replace
the "narrowing still deferred" paragraph in the header comment with the new rules:

```ts
if (actor.role === Role.STUDENT) {
  const gradeLevelId = await this.enrollments.activeGradeLevelIdFor(actor.userId);
  if (!gradeLevelId) return [];
  return entitled
    .filter((c) => c.audience === ContentAudience.STUDENT && c.gradeLevelId === gradeLevelId)
    .map((c) => c.curriculumId);
}

if (actor.role === Role.TEACHER) {
  const taught = await this.teacherAssignments.taughtPairsFor(actor.userId);
  if (taught.length === 0) return entitled.map((c) => c.curriculumId);   // decision 4
  const pairs = new Set(taught.map((p) => pairKey(p.gradeLevelId, p.subjectId)));
  return entitled
    .filter((c) => c.audience === ContentAudience.TEACHER ||               // decision 5
                   pairs.has(pairKey(c.gradeLevelId, c.subjectId)))
    .map((c) => c.curriculumId);
}

return entitled.map((c) => c.curriculumId);   // SCHOOL_ADMIN, unchanged
```

`includes()` is untouched — it derives from `resolve()`, so the narrowing and the audience
filter reach single-video, single-document and single-tree reads for free. **This is the one
choke point that keeps students out of teacher content.**

**`entitlements.module.ts`** — `imports: [StudentsModule, TeachersModule]`. Cycle audit:
`TeachersModule` imports only `MailModule` + `PasswordsModule` and must never import
`EntitlementsModule`; `StudentsModule` already sets the precedent.

**Audience is a browse filter, not a scope filter,** for TEACHER/SCHOOL_ADMIN: scope stays "both
audiences", and `ContentTreeService.findAllVisibleTo(actor, audience?)` narrows the list. A
STUDENT sending `?audience=TEACHER` gets `[]` because their scope holds no TEACHER curricula —
no second check, no drift.

---

## Phase 3 — Teacher ↔ grade

**`teacher-assignments.service.ts`** — `ASSIGNMENT_INCLUDE` gains `gradeLevel: { select: { id, name } }`;
`toEntity` reads grade off the row instead of through the section (`sectionLabel` keeps its
nested section include). `create()` gets a derive-and-verify block replacing the existing
`section.findUnique`:

- section given → look it up, 404 if missing; if `dto.gradeLevelId` also given and differs → **400** `'That grade level does not match the section'`; otherwise derive from the section.
- no section, grade given → `gradeLevel.count`, 404 if missing.
- P2002 message stays generic (three partial indexes, none maps to a clean column substring).

`ListTeacherAssignmentsQueryDto` gains `gradeLevelId?`. `CreateTeacherAssignmentDto` gains
optional `gradeLevelId`.

**`dto/create-teacher.dto.ts`** — `subjectIds: string[]` is **replaced** by
`assignments: { subjectId, gradeLevelId? }[]` (`@ValidateNested` + `@Type`). Not kept alongside:
two shapes for the field that decides a teacher's library is two sources of truth, and
`forbidNonWhitelisted` makes the old shape a loud 400 rather than a silent no-op. Dedupe on
`${subjectId}:${gradeLevelId ?? ''}` in the service (`@ArrayUnique` no longer expresses the rule).

**`teachers.service.ts`** — validate distinct subject ids (existing retired check unchanged) and
distinct grade ids (404 on miss), then `createMany` with `gradeLevelId`. `TeacherEntity.subjects`
entries gain nullable `gradeLevelId`/`gradeLevelName`.

**CSV import** — `IMPORT_TEMPLATE_HEADERS` gains `grade_level`, **not** added to
`REQUIRED_HEADERS` so files written before today still import (producing legacy grade-less rows).
Parser reads it into `ParsedTeacherRow.gradeLevelName`; new error code `UNKNOWN_GRADE_LEVEL`;
`teacher-import.service.ts` gains `resolveGradeLevels()` alongside `resolveSubjects()`, keyed on
a normalised `GradeLevel.name` (it is `@unique`). Template sample row and the error-report CSV
pick up the column automatically via the header constant.
**Documented limitation:** one `grade_level` per row, applying to all of that row's
`subject_codes`. Multi-grade teachers get extra assignments from `POST /teacher-assignments` —
relaxing `DUPLICATE_IN_FILE` would let one file create the same `User` twice.

**`taxonomy/taxonomy.service.ts`** — `deleteGradeLevel` adds a third count. Without it the new
`Restrict` FK surfaces as a raw P2003 → 500:

```ts
this.prisma.teacherAssignment.count({ where: { gradeLevelId: id } }),
```
Rooted at the referencing model, never through a `GradeLevel` relation — same reason the
existing section count is (see the risks section).

---

## Phase 4 — Audience on curricula

**Extract the node guard first.** New `curriculum/content-node-usability.service.ts` with
`assertNodeUsable(contentNodeId, contentLabel: 'Videos' | 'Documents')` — body is
`VideosService.assertNodeUsable` (:561) verbatim, only the 409 string templated. This is the
second caller, which is when CLAUDE.md permits abstracting; `common/` is the wrong home because
every rule it enforces names a curriculum concept. Exported from `CurriculumModule`;
`VideosService` drops its private copy and calls it with `'Videos'` so existing 409 assertions
pass unchanged. Cycle audit: `VideosModule → CurriculumModule → EntitlementsModule → (Students, Teachers)`;
nothing points back.

**`curricula.service.ts`** — `CURRICULUM_SELECT` += `audience`; `findAll` filters on it;
`create` writes `dto.audience ?? STUDENT` and the P2002 message becomes
`'A curriculum already exists for that grade level, subject and audience'`; `remove` gains a
third count (`document.count({ where: { node: { curriculumId: id } } })`) with its own 409;
`videoCountsFor` generalises to `contentCountsFor → Map<string, {videos, documents}>` (one extra
grouped query per page, not per card). `CreateCurriculumDto`/`ListCurriculaQueryDto` gain
optional `audience` — optional-with-STUDENT-default so the existing web form and e2e fixtures
keep working, and the safe default is the status quo. `CurriculumEntity` += `audience`, `documentCount`.

**`content-tree.service.ts`** — `assemble`'s `$transaction` becomes three queries; documents
bucket by `contentNodeId` exactly as videos do; the option renames `readyVideosOnly` →
`readyContentOnly`; `nest()` gains `documents` + `documentCountDeep` rolled up in the *same*
reverse pass (do not reorder the `orderBy: [{depth:'asc'},{sortOrder:'asc'}]` — the single-pass
nesting depends on it); `findAllVisibleTo(actor, audience?)` adds `audience` to its `where`;
`ContentTreeEntity` += `audience`.

**`content-nodes.service.ts`** — the delete guard (:255) and move guard (:198) must count
documents too: `OR: [{ videos: { some: {} } }, { documents: { some: {} } }]`, with the 409 wording
generalised from "videos" to "content".

**`curricula.controller.ts`** — `GET /curricula` gains a `ListMyCurriculaQueryDto { audience? }`.
Route key unchanged → **no `MATRIX` change**.

**`content-entitlements-admin.service.ts`** — nested `curriculum` selects gain `audience`;
`toEntity` returns it. Critically, `ReplaceEntitlementsDto` gains optional `audience` and the
revoke diff is scoped to it:

```ts
const toRevoke = currentRows.filter(
  (row) => row.curriculum.subject.status !== SubjectStatus.RETIRED &&
           (dto.audience === undefined || row.curriculum.audience === dto.audience) &&
           !desiredSet.has(row.curriculumId),
);
```
Without this, saving the Teachers tab revokes every Students grant — the same shape as the
retired-subject trap the existing code already comments about, and it will look like data loss.

**`content-impact.service.ts`** — returns `audience`, `documentCount`, and `teacherCount`
(`teacherAssignment.count({ where: { schoolId: { in: schoolIds }, gradeLevelId, subjectId } })`,
rooted at the referencing model). Populate `studentCount` and `teacherCount` always rather than
branching on audience — a number whose meaning changes silently is worse than an irrelevant one.

**`packages/shared-types/src/index.ts`** — hand-mirrored, no codegen. Add `ContentAudience` and
`DocumentStatus` enums with the usual "mirrors schema.prisma" comment; then `Curriculum` +=
`audience`/`documentCount`, `ContentTree` += `audience`, new `ContentTreeDocument`,
`ContentTreeNode` += `documents`/`documentCountDeep`, `Entitlement` += `audience`, `ContentImpact`
+= three fields, `TeacherAssignment`/`TeacherSubject`/`CreateTeacherInput` reshaped, plus the new
`Document`/`AdminDocument`/`DocumentDownload` shapes.

---

## Phase 5 — The `Document` feature module

`apps/api/src/documents/` — the exact shape of `videos/`, minus `TranscodingModule`; no barrel
`index.ts`. Files: `documents.module.ts`, `documents.controller.ts`,
`documents-admin.controller.ts`, `documents.service.ts`, `documents-access.policy.ts`,
`document-ingest.constants.ts`, two specs, `dto/` (create, update, request-upload,
list-admin-query), `entities/` (document, admin-document, admin-document-detail,
paginated-admin-documents, document-upload-ticket, document-download).

`document-ingest.constants.ts` mirrors `video-ingest.constants.ts`:
`ACCEPTED_DOCUMENT_CONTENT_TYPES = ['application/pdf']`, `MAX_DOCUMENT_BYTES = 50 * 1024 * 1024`,
`isAcceptedDocumentContentType()`.

`documents-access.policy.ts` is byte-for-byte `VideosAccessPolicy`'s shape:
`EntitleableDocument { curriculumId }`, `canRead` → `contentScope.includes`. With
`requireReadable`, an out-of-scope read is a **404**.

**Lifecycle** (`documents.service.ts`):
1. `create` — `assertNodeUsable(nodeId, 'Documents')`, `$transaction`(create `UPLOADING` → update `sourceKey = documents/{id}/source.pdf`), presign **after** commit.
2. Browser PUTs straight to the bucket; bytes never touch the API or BFF.
3. `markUploaded` — 409 unless `UPLOADING` (double-confirm is a conflict, not a no-op), then `storage.statObject` decides: missing / empty / >50 MB / not `application/pdf`. Each rejection persists `status: FAILED` + `failureReason` **before** throwing the 400 — documents have no worker to write a reason later. Success → `READY` with verified `sizeBytes`/`contentType`. **No queue call, no `sweepStale()`.**
4. `createUploadUrl` — repair path, `UPLOADING`/`FAILED` only (re-presigning a READY document would let an admin swap the file out from under entitled schools). Resets to `UPLOADING` and clears the verified fields.
5. `createDownloadFor` — `findFirst({ id, status: READY })` selecting `sourceKey` + `node.curriculum.id`, through `requireReadable`, then `storage.createPresignedDownload`. Returns `{ url, expiresInSecs, fileName }` as **JSON, not a 302** — a redirect puts the signed URL into history and `Referer`, and the page needs it as data anyway.
6. `remove` — delete the row, then best-effort `deletePrefix('documents/{id}/')` with a `logger.warn` on failure. Row first: an orphaned object can be swept, a row pointing at a deleted object is a permanently broken download. No in-flight guard (no worker to strand).

Bucket layout `documents/{id}/source.pdf` in the existing `S3_INGEST_BUCKET` — no new env var.
The `documents/` prefix (which `Video.sourceKey`'s `{videoId}/source.mp4` historically lacks)
is what makes `deletePrefix` safe.

**No `/retry` route** — there is nothing to re-drive; `upload-url` is the whole repair path.
Put the full "how this differs from Video" list in the service header comment: no `externalId`,
renditions, fencing token, queue, reconciler, `QUEUED`/`PROCESSING`, worker callback, HLS proxy,
playback JWT or `retainSource`.

**Routes** — `@Roles(SCHOOL_ADMIN, TEACHER, STUDENT)` class-level on `DocumentsController`
(`GET /documents`, `/documents/:id`, `/documents/:id/download`); `@Roles(SUPER_ADMIN)` on
`DocumentsAdminController` (`GET`, `GET /:id`, `POST`, `PATCH /:id`, `POST /:id/uploaded` @200,
`POST /:id/upload-url`, `DELETE /:id` @204). Neither needs `@BypassTenantScope()` — copy
`VideosAdminController`'s header note that this holds only while nothing here includes the
`entitlements` relation.

---

## Phase 6 — Web

- **`lib/api-client.ts`** — `apiListMyCurricula(token, audience?)` and `apiListCurricula`'s query gain `audience`. Ten new document functions (`apiListDocuments`, `apiGetDocument`, `apiGetDocumentDownload`, `apiListAdminDocuments`, `apiGetAdminDocument`, `apiCreateDocument`, `apiCreateDocumentUploadUrl`, `apiConfirmDocumentUpload`, `apiUpdateDocument`, `apiDeleteDocument`), each the standard `fetch → handleResponse<T>` shape.
- **BFF** — `app/api/documents/route.ts`, `[id]/route.ts`, `[id]/uploaded/`, `[id]/upload-url/`, `[id]/download/`, mirroring `app/api/videos/*`.
- **`app/dashboard/videos/page.tsx`** — `searchParams.audience`, default `STUDENT`. A server-rendered two-link segmented control (`<Link href="?audience=…">`) labelled **For My Students** / **For Me**, rendered only when `user.role !== Role.STUDENT`. Comment it as presentation-only, in the spirit of `nav.ts`'s header — hiding the toggle is not what protects the content. Audience threads through every card href; audience-aware empty-state copy.
- **`[curriculumId]/page.tsx`** — `Branch`'s early return becomes `videoCountDeep === 0 && documentCountDeep === 0`; render `node.documents` as sibling rows with a `FileText` icon linking to `…/documents/{id}`; summary line becomes `{levelName} · n videos · m documents` (omit zeroes).
- **New `[curriculumId]/documents/[documentId]/page.tsx`** — server component. `apiGetDocument` (404 → `notFound()`), assert `curriculumId` matches (same guard the video page uses), `apiGetDocumentDownload`, then an `<iframe src={url}>` plus a prominent **Download PDF** anchor. The anchor points at the **BFF route** (`/api/documents/:id/download`, which re-mints and redirects), not the raw URL — see risk 8.
- **`content-library/`** — `_components/document-ingest-panel.tsx` + `document-metadata-form.tsx`, cloned from the video pair; `upload-with-progress.ts` and `upload-progress-bar.tsx` reused unchanged. Catalogue gains a Videos/Documents split; the curriculum picker in both metadata forms shows an audience column.
- **`entitlements/[schoolId]/`** — `EntitlementMatrix` gains an `audience` prop + Students/Teachers tabs; the PUT body carries `audience` so the API's revoke diff stays tab-scoped.
- **Teacher forms** — `create-teacher-form.tsx`'s subject checkboxes become `[subject][grade][remove]` rows posting `assignments[]` (needs `apiListGradeLevels`, already `@AnyRole`); `create-assignment-form.tsx` gains a grade select, disabled and auto-filled when a section is picked, mirroring the API rule so the UI cannot produce the 400; bulk import panel gains the column and the `UNKNOWN_GRADE_LEVEL` label.
- **`lib/nav.ts`** — `STUDENT_HOME` unchanged (audience is a query param on the same route, so `canRoleAccess` and the redirect target still agree). Relabel `labelByRole` for SCHOOL_ADMIN/TEACHER from `'Video Library'` to `'Library'`. **No new nav item.**

---

## Phase 7 — Tests

**Unit specs to update:** `actor-content-scope.service.spec.ts` (mock `taughtPairsFor`; delete the
"narrowing pending" test; add lenient fallback, `(g5, maths)` narrowing, teacher keeps all
TEACHER curricula, **STUDENT never receives a TEACHER curriculum**, `includes()` refuses one for a
student), `teacher-assignments.service.spec.ts`, `teachers.service.spec.ts`,
`teacher-import.{parser,service}.spec.ts`, `curricula.service.spec.ts`,
`content-tree.service.spec.ts`, `content-nodes.service.spec.ts`,
`content-entitlements-admin.service.spec.ts`, `videos.service.spec.ts` (mocked
`ContentNodeUsabilityService`; existing 409 strings must still pass), `taxonomy.service.spec.ts`.

**New unit specs:** `documents.service.spec.ts`, `documents-access.policy.spec.ts`,
`content-node-usability.service.spec.ts`.

**`test/utils/content-fixtures.ts`** — the entitlement asymmetry is load-bearing and every
addition preserves it:
- `audience` on the four existing curriculum specs (all `STUDENT`); compound upsert key → `gradeLevelId_subjectId_audience`.
- New `g5MathsTeacher` (PUBLISHED, **granted** to demo-school) and `g6ScienceTeacher` (PUBLISHED, **granted to nobody**) — the latter is the negative fixture proving teacher content is not universally visible.
- One READY `Document` under g5Maths and one under g5MathsTeacher, plus one under g6Maths for the 404 case. Export `ENTITLED_DOCUMENT_TITLE` / `TEACHER_DOCUMENT_TITLE`.
- One READY video under the g5MathsTeacher topic (`TEACHER_VIDEO_TITLE`) so "a student cannot reach teacher content" has a concrete target.
- demo-school's grants go `[g5Maths, draft]` → `[g5Maths, g5MathsTeacher, draft]`. Still one published STUDENT + one published TEACHER + one draft; `g5Science`, `g6Maths`, `g6ScienceTeacher` stay ungranted; **demo-school-b still holds nothing.**
- **No teacher assignments for `teacher@smartteacher.dev`** — leaving them unassigned keeps every existing library spec passing *and* is itself the assertion for the lenient fallback. The narrowing spec creates and deletes its own, the way `entitlements.e2e-spec.ts` restores grant asymmetry.
- `global-setup.ts` unchanged.

**E2e:** new `documents.e2e-spec.ts` (mirrors `videos.e2e-spec.ts`) and
`teacher-content-scope.e2e-spec.ts` (the heart of this: unassigned teacher matches admin's list;
grant `g5Science` in-spec, prove the unassigned teacher sees it and the assigned one does not,
revoke; TEACHER-audience list unaffected by assignment). Updates to `content-tree.e2e-spec.ts`
(incl. **`GET /curricula?audience=TEACHER` returns `[]` for `student@`** — the standing
regression test), `videos.e2e-spec.ts`, `entitlements.e2e-spec.ts`, `curriculum.e2e-spec.ts`,
`teachers*.e2e-spec.ts`, `teacher-assignments.e2e-spec.ts`.

**`rbac-matrix.e2e-spec.ts`** — exactly ten new rows (three `/documents` at
`[SCHOOL_ADMIN, TEACHER, STUDENT]`, seven `/admin/documents` at `[SUPER_ADMIN]`), add
`'/admin/documents'` to `CONTENT_AUTHORING_AND_ENTITLEMENT_PATHS`, and bump the vacuity guards
`contentRows.length >= 19 → >= 26` and `adminRows.length >= 17 → >= 24`. No existing row changes.

---

## Risks

1. **Where a STUDENT could reach TEACHER content — the audit list.** `ActorContentScopeService.resolve`'s STUDENT branch is the *single* choke point; `VideosService.findAll/findOne/findPlayableVisibleTo`, `ContentTreeService.findVisibleTo` and `DocumentsService` all inherit it. **Verify `PlaybackService` routes through `findPlayableVisibleTo` and not a bare `video.findFirst`** — a path that re-derives entitlement instead of using the seam would let a student mint a token for a guessed teacher-video id.
2. **Tenant-guard include direction.** `listEntitledCurricula` must stay a to-one platform-global child from a tenant-scoped root. `taughtPairsFor` must not hop through `section`. `TaxonomyService.deleteGradeLevel`'s new count and `ContentImpactService.teacherCount` must be rooted at `TeacherAssignment` — a `gradeLevel.findUnique({ include: { teacherAssignments } })` answers "in this one tenant", the wrong question for a platform-wide guard.
3. **`forbidNonWhitelisted` makes `subjectIds` → `assignments` a hard break** (400, not a silent drop). Grep `subjectIds` across `apps/web` and `apps/api/test` before merging.
4. **`replaceForSchool`'s audience-scoped diff** — skip it and saving the Teachers tab wipes the Students grants. Looks like data loss, not a bug.
5. **`content-fixtures.ts` won't compile after Phase 1** until the compound key is fixed. That is a feature, but it means Phase 1 must touch that file in the same commit.
6. **`.env.test` migration** — `DATABASE_URL=<test-db-url> npx prisma migrate deploy` from `apps/api` before `npm run test:e2e`, per CLAUDE.md. Skipping it fails on a missing `audience` column in a way that reads as a code bug.
7. **PDF-in-iframe is browser-dependent.** All desktop targets render natively; some corporate policies and mobile browsers do not. The Download button is the fallback and must be prominent, not a footnote.
8. **`S3_DOWNLOAD_URL_EXPIRY_SECS = 300`** — a teacher who leaves the tab open ten minutes and then clicks Download gets an S3 `AccessDenied` XML page. Hence the anchor pointing at the BFF re-mint route while the iframe uses the direct URL.
9. **`CLAUDE.md` is stale at line 246** — it claims `TeacherAssignment` has no `sectionId`, which F-08 already added. Correct it in the same commit as the narrowing, since that paragraph is the thing this work resolves.

---

## Verification

```bash
# 1. Migration on dev + test databases
npm run db:migrate
cd apps/api && DATABASE_URL=<test-db-url> npx prisma migrate deploy

# 2. Full gate (CLAUDE.md's "before considering work done")
npm run lint          # no new warnings
npm run build         # all workspaces, incl. shared-types
npm run test:e2e      # rbac-matrix + all suites

# 3. Targeted
cd apps/api && npx jest --config ./test/jest-e2e.json -t "teacher content scope"
cd apps/api && npx jest --config ./test/jest-e2e.json -t "documents"
```

**Manual end-to-end, on a fresh stack** (`docker compose up -d postgres`, `npm run db:seed`, `npm run dev`):
1. As SUPER_ADMIN — create grade + subjects (incl. "Professional Development"), a `chapter-topic` schema, then a **STUDENT** and a **TEACHER** curriculum for (Grade 5, Maths). Build a node tree in each and publish both.
2. Upload a video to the student tree and both a video *and* a PDF to the teacher tree; confirm each reaches `READY` (the PDF should be `READY` immediately — no worker involved).
3. Grant the school **only** the student curriculum → log in as a teacher: the *For Me* tab is empty. Grant the teacher curriculum → it appears. This is the proof that entitlement is per audience.
4. As SCHOOL_ADMIN — create a teacher with an explicit (Maths, Grade 5) assignment. Log in as them: *For My Students* shows Grade 5 Maths only; *For Me* shows Grade 5 Maths **and** Professional Development.
5. Grant the school Grade 6 Science (student) → confirm the assigned teacher does **not** see it, and an *unassigned* teacher **does** (the lenient fallback).
6. Open the lesson-plan PDF: it renders in the iframe, Download works, and hard-refreshing after >5 minutes still works (BFF re-mint).
7. Log in as a student: no audience switch is rendered, `?audience=TEACHER` returns an empty list, and the teacher video's id 404s on `GET /videos/:id`.

> Per your standing preference, on approval I'll also write this plan to
> `docs/2026-08-08-teacher-content-plan.md` as the first step.
