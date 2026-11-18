# Multi-class enrollment & class switching — plan

**Date:** 2026-10-31 · **Status:** implemented (migration `20261031120000_allow_multi_class_enrollment`)

## 1. Requirement

A student can be actively enrolled in **more than one class (Section) at a time**, and can **switch** between them when they belong to several.

Decisions confirmed with the product owner:

| Question | Decision |
| --- | --- |
| May a student's classes span grade levels? | **Yes.** Grade 5-A and Grade 6-Maths together is valid. |
| Where is the selected class remembered? | **Server-side.** Web, mobile and every device see the same selection; `GET /users/me` returns it. |
| What does the selected class filter? | The **content library, tasks and home feed** narrow to the selected class. **Notifications** still arrive from every class. |

## 2. Where we are today

The schema already expects this. `Enrollment` is a many-to-many join, and the comment above it says so (*"Many-to-many by design so multi-section students can be allowed later without a migration"*). Only one hand-written partial index enforces one class per student:

```sql
CREATE UNIQUE INDEX "Enrollment_userId_active_key" ON "Enrollment"("userId") WHERE "status" = 'ACTIVE';
```

The application code assumes a single class in these places:

| Location | Single-class assumption |
| --- | --- |
| `students/enrollment-lookup.service.ts` | `activeGradeLevelIdFor` / `activeProfileFor` use `findFirst` with no ordering. With two rows the result is arbitrary. |
| `students/enrollments.service.ts` `endActive` | Ends **every** ACTIVE row. Today "change section" means "leave all classes". |
| `students/students.service.ts` | `STUDENT_ENROLLMENT_INCLUDE` uses `take: 1`. `update` reads `enrollments[0]` as "the" class. |
| `students/entities/student.entity.ts`, `users/entities/me.entity.ts`, `shared-types` `Student` | Expose a single `enrollment`. |
| `entitlements/actor-content-scope.service.ts` | STUDENT scope comes from that single arbitrary grade. |
| `entitlements/content-impact.service.ts` | Counts enrollment **rows** as students, so a student in two sections of one grade is counted twice. |
| `tasks/tasks.service.ts` `studentTasks` | Returns every assignment. There is no class filter. |
| `apps/web/.../students/*` | The admin UI shows and edits one section. |

Paths that already work with many classes and need no change: `TeacherClassScopeService.resolveStudents` (uses `distinct`), task fan-out and `backfillForNewEnrollment` (both per section), the `GET /students?sectionId=` filter (`some`), and roll-number uniqueness (per section, enforced on the enrollment row).

## 3. Design

### 3.1 Data model: `isCurrent` on `Enrollment`

Add one column. Do not add a pointer on `User`.

```prisma
model Enrollment {
  // ...existing fields
  // Which ACTIVE enrollment the student is currently "in". Exactly one per student with
  // any ACTIVE enrollment — at most one by partial index, at least one by
  // EnrollmentsService being the only writer (see §3.2).
  isCurrent  Boolean          @default(false)
}
```

Migration `YYYYMMDDHHMMSS_allow_multi_class_enrollment` (written by hand, as with the existing partial indexes):

```sql
ALTER TABLE "Enrollment" ADD COLUMN "isCurrent" BOOLEAN NOT NULL DEFAULT false;
-- Every existing ACTIVE row is a student's only class, so it is their current one.
UPDATE "Enrollment" SET "isCurrent" = true WHERE "status" = 'ACTIVE';

DROP INDEX "Enrollment_userId_active_key";
-- At most one current class per student.
CREATE UNIQUE INDEX "Enrollment_userId_current_key"
  ON "Enrollment"("userId") WHERE "status" = 'ACTIVE' AND "isCurrent";
-- Never enrolled twice, at the same time, in the same section.
CREATE UNIQUE INDEX "Enrollment_userId_sectionId_active_key"
  ON "Enrollment"("userId", "sectionId") WHERE "status" = 'ACTIVE';
```

**Why a flag on `Enrollment` and not `User.currentEnrollmentId`:**
- It uses the partial-unique-index pattern this table already relies on.
- It stays on a model that is already tenant-scoped.
- Ending an enrollment clears it by construction. A `User` pointer can be left pointing at an ENDED row, and every reader would then have to defend against that.

No change to `TENANT_SCOPED_MODELS`: no new model is added.

### 3.2 `EnrollmentsService` is the only writer

| Method | Behaviour |
| --- | --- |
| `enroll(tx, input)` | Creates the row. It becomes `isCurrent` **only if** the student has no other ACTIVE enrollment. Adding a second class never moves the student out of the class they are using. Backfills tasks as today. |
| `replace(tx, current, input)` | Used by `PATCH /students/:id` when the section changes. Ends the current row and creates the new one, which inherits its `isCurrent`. |
| `end(tx, userId, enrollmentId)` *(replaces `endActive`)* | Sets one row to ENDED. If that row was current, promotes the oldest remaining ACTIVE row (`startedAt asc`). |
| `switchCurrent(tx, userId, enrollmentId)` | Clears the flag on the old row, then sets it on the target, in that order inside the transaction so the partial index is never violated mid-way. A target that is missing, not ACTIVE, or another student's row is a `NotFoundException`. |
| `enrollMany` | Unchanged apart from setting `isCurrent: true`. Import rows are always brand-new students. |

A P2002 on `Enrollment_userId_sectionId_active_key` becomes a `409 'Student is already enrolled in this section'`.

### 3.3 Reads: `EnrollmentLookupService`

| Method | Purpose |
| --- | --- |
| `activeEnrollmentsFor(userId)` | Every ACTIVE row, ordered `isCurrent desc, startedAt asc`. |
| `activeProfilesFor(userId)` | Replaces `activeProfileFor`; feeds `GET /users/me`. Same ordering, so the head is the current class and the result is never arbitrary. |
| `currentSectionIdFor(userId)` | Feeds the student task filter (§3.5). |
| `activeGradeLevelIdsFor(userId)` | Distinct grade ids across all ACTIVE rows, for authorization (§3.4). |
| `currentGradeLevelIdFor(userId)` | For browsing (§3.4). Replaces `activeGradeLevelIdFor`. |

### 3.4 Content scope: authorization is the union of classes, browsing is the current class

This is the one deliberate change to an existing invariant, so it needs review.

`ActorContentScopeService` gains a second entry point:

```ts
resolve(actor)        // AUTHORIZATION — STUDENT: entitled STUDENT curricula for ANY active-enrollment grade
resolveBrowse(actor)  // PRESENTATION — STUDENT: same, narrowed to the current enrollment's grade
                      // Non-students: identical to resolve()
includes(actor, id)   // unchanged: still derived from resolve()
```

- **Policies and single-resource reads** (`VideosAccessPolicy`, `DocumentsAccessPolicy`, `CurriculumAccessPolicy`, playback tokens, progress writes) keep calling `resolve` / `includes`. They therefore accept anything the student is enrolled for.
- **Browse lists** (`videos` / `documents` list, `content-tree`, `library-search`, `history`, `bookmarks`, `home`) switch to `resolveBrowse`.

**Why not narrow authorization to the current class as well:**
1. `TasksService.create` checks each recipient with `contentScope.includes`. If that followed the student's selection, a teacher assigning Grade 6 homework would get a `422` whenever the student happened to have their Grade 5 class open.
2. A notification tap or deep link into class B content would `404` while the student is in class A.
3. Security does not change. Scope is still deny-by-default, still intersected with the school's entitlements, and still empty for an unplaced student. A student only ever reaches curricula of grades they are actually enrolled in.

The CLAUDE.md invariant *"a single-resource read can never be wider than the list"* becomes: *"never wider than the **authorization** scope, which every list is derived from."* CLAUDE.md is updated in the same change.

### 3.5 Tasks and home feed

`TasksService.studentTasks` gains a current-class filter:

```ts
OR: [
  { task: { sectionId: current.sectionId } },
  { task: { sectionId: null } },   // addressed to the student personally — shown in every class
]
```

- A student with no current enrollment sees only personally addressed tasks.
- `findStudentTask(id)` stays **unfiltered**, so a task opened from a notification for another class still loads.
- `home.student` inherits the filter through `studentTasks`.
- Notifications: no change.

The teacher side needs no change. Fan-out, backfill and class rollups are already per section.

### 3.6 API surface

**Student (self):**

| Route | Role | Notes |
| --- | --- | --- |
| `GET /users/me` | AnyRole | `enrollment` is now the **current** class. New `enrollments: MeEnrollmentEntity[]` (each has `isCurrent`) feeds the class switcher. |
| `PUT /users/me/current-enrollment` | `STUDENT` | Body `{ enrollmentId }`. Returns the updated `MeEntity`. Any id that is not one of the caller's own ACTIVE enrollments returns `404`. |

**School admin (managing a student's classes):**

| Route | Role | Notes |
| --- | --- | --- |
| `POST /students/:id/enrollments` | `SCHOOL_ADMIN` | `{ sectionId, rollNumber? }`. Adds a class. Returns `409` on a duplicate section or roll number. |
| `PATCH /students/:id/enrollments/:enrollmentId` | `SCHOOL_ADMIN` | `{ rollNumber }` (an empty string clears it). |
| `DELETE /students/:id/enrollments/:enrollmentId` | `SCHOOL_ADMIN` | Ends the enrollment (ENDED, history kept) and promotes another class if needed. `204`. |
| `PATCH /students/:id` | *(unchanged)* | `sectionId` / `rollNumber` keep their meaning but act on the **current** enrollment ("move this class"), so existing callers keep working. |
| `POST /students` | *(unchanged)* | Still creates with zero or one section. More classes are added with the route above. |

Each new route gets a `MATRIX` row in `rbac-matrix.e2e-spec.ts` and Swagger decorators. The enrollment id is resolved through the student, so a mismatched pair (`:id` does not own `:enrollmentId`) returns `404`.

**Response shapes:** `StudentEntity` gains `enrollments: StudentEnrollmentEntity[]` (each with `isCurrent`). `StudentEntity.enrollment` stays and means "current". It is marked deprecated in Swagger and removed once the web and mobile clients have moved. `shared-types` `Student` / `StudentEnrollment` are updated to match.

### 3.7 Other fixes

- `ContentImpactService` counts **distinct** students (`findMany({ distinct: ['userId'] })` length, or `groupBy`) rather than enrollment rows.
- Bulk CSV import is unchanged: one row creates one student with one class. Adding a class by repeated rows is out of scope.

### 3.8 Web (admin console)

- `dashboard/students/page.tsx`: the Section column lists every class as chips, with the current class marked. Roll number is shown per chip.
- `student-row-actions.tsx`: the single section picker becomes a "Classes" panel with add-class (section + roll number), edit roll number, and remove. All calls go through `lib/api-client.ts` and the existing BFF.
- No student-facing web UI exists. The **class switcher is a mobile concern**, built on `GET /users/me` + `PUT /users/me/current-enrollment`. `docs/2026-09-11-learning-activity-mobile-plan.md` gets a short addendum.

## 4. Tests

**Unit (Prisma mocked):**
- `enrollments.service.spec.ts`:
  - The first enroll becomes current. A second enroll does not move the current class.
  - Ending the current class promotes the oldest remaining one. Ending a non-current class leaves the current class alone.
  - `switchCurrent` rejects another student's enrollment and ENDED enrollments with a 404.
- `actor-content-scope.service.spec.ts`:
  - `resolve` is the union across grades. `resolveBrowse` is the current grade only.
  - A student with no enrollment gets `[]` from both.
- `students.service.spec.ts`: a duplicate active section returns 409. `PATCH sectionId` replaces only the current class.
- `tasks.service.spec.ts`: `studentTasks` returns the current section's tasks plus personally addressed tasks, and never another class's section tasks.

**E2e:**
- Student in Grade 5-A and a Grade 6 section:
  - The library lists Grade 5 content.
  - After `PUT /users/me/current-enrollment` it lists Grade 6 content.
  - A Grade 6 video opened directly while Grade 5 is current still plays.
- A teacher can assign Grade 6 work to the student whatever class the student has selected.
- `PUT /users/me/current-enrollment` with another tenant's enrollment id, or another student's, returns `404`.
- Cross-tenant: a `demo-school-b` admin calling `POST /students/:id/enrollments` on a `demo-school` student returns `404`.
- `content-fixtures.ts`: add a second section enrollment for the fixture student. **Keep entitlements asymmetric:** `demo-school` gains no new entitlement. The Grade 6 checks use a curriculum the spec grants locally, or they assert an empty Grade 6 library, so the existing asymmetry assertions are not made vacuous.

## 5. Order of work

1. Migration + `schema.prisma` (`isCurrent`, the index swap) → `npm run db:migrate`, then `migrate deploy` on `smartteacher_test`.
2. `EnrollmentsService` / `EnrollmentLookupService` + unit tests.
3. `ActorContentScopeService.resolveBrowse`, then move the browse callers over + tests.
4. `StudentsService` / entities / new enrollment routes + MATRIX rows.
5. `UsersService.getProfile` + `PUT /users/me/current-enrollment` + MATRIX row.
6. `TasksService.studentTasks` filter, `ContentImpactService` distinct count.
7. `shared-types`, then the web admin UI.
8. Update CLAUDE.md (STUDENT scope wording, the reworded invariant), add the mobile plan addendum.
9. `npm run lint` → `npm run build` → `npm run test:e2e`.

## 6. Open points for review

- **Promotion rule when the current class ends:** this plan promotes the oldest remaining class. The alternative is "most recently joined". Either is one `orderBy`.
- **Personally addressed tasks shown in every class:** the alternative is to show them only under a class whose grade matches the resource, which costs a curriculum join per query. This plan recommends the simple rule.
- **Removing deprecated `StudentEntity.enrollment`:** set a target date once the mobile client ships the switcher.
