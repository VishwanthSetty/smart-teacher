# Backend plan — Learning activity, tasks & notifications

**Date:** 2026-09-11
**Scope:** `apps/api` only. The data model, modules, routes and rules behind the first-release student and teacher feature set.
**Companion:** `docs/2026-09-11-learning-activity-mobile-plan.md` (Flutter client). The web client consumes the same API; its screens are not planned here.
**Baseline:** `docs/2026-09-11-teacher-student-features.md` describes what exists today. Everything below is new.

---

## 0. What already exists, and what this plan must not disturb

| Existing | Keep intact |
| --- | --- |
| `ActorContentScopeService.resolve()` — the single answer to "which curricula may this actor reach?" | **Every** new read (history, search, bookmarks, task resources) resolves through it. A new surface must never be wider than the library. |
| `VideosService.findPlayableVisibleTo` → ES256 playback token | Progress writes do **not** become a second, weaker gate. A progress write for an unreachable video is a `404`. |
| `prisma/tenant-guard.extension.ts` | Every new table carries a non-null `school_id` and is registered in `TENANT_SCOPED_MODELS` the same day its migration lands. |
| 404-not-403 for anything the caller isn't entitled to see | Applies to tasks, other students' progress, other teachers' collections. |
| `rbac-matrix.e2e-spec.ts` `MATRIX` | Every route added below gets a row in the same commit. |

Two facts shape the whole design:

1. **Content is platform-global; activity is tenant-owned.** `Video` and `Document` have no `schoolId`. Every activity row this plan adds *does* — it belongs to a user inside a school, and is tenant-scoped even though the resource it points at is not.
2. **Teachers are currently school-wide, not class-scoped.** `GET /students` and `GET /sections` return the whole school. Task assignment and student progress reports **must not inherit that breadth** — they get a new, narrower scope service (§4).

---

## 1. Data model

Six new tables plus three enums. All tenant-scoped.

### 1.1 `ResourceActivity` — one row per (user, resource)

The single source of truth for history, continue-watching, continue-reading, progress status, and task completion.

```prisma
enum ResourceType {
  VIDEO
  DOCUMENT
}

enum ProgressStatus {
  NOT_STARTED   // never persisted — the absence of a row IS not-started
  IN_PROGRESS
  COMPLETED
}

model ResourceActivity {
  id           String       @id @default(cuid())
  schoolId     String
  school       School       @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  userId       String
  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  resourceType ResourceType
  // Exactly one of these is non-null; a CHECK constraint in the migration enforces it.
  // Two nullable FKs rather than one untyped id column: Prisma cannot express a
  // polymorphic relation, and an unconstrained string would let a deleted video leave
  // a dangling activity row that still counts toward a progress summary.
  videoId      String?
  video        Video?       @relation(fields: [videoId], references: [id], onDelete: Cascade)
  documentId   String?
  document     Document?    @relation(fields: [documentId], references: [id], onDelete: Cascade)

  status       ProgressStatus @default(IN_PROGRESS)

  // --- playback position, deliberately separate from completion ---
  // Where to resume. Moved by seeks; says nothing about how much was watched.
  positionSecs Int      @default(0)
  // Merged, non-overlapping [startSecs, endSecs] pairs of what was actually played.
  // Json rather than a child table for the same reason as TeacherImportBatch.validRows:
  // it is only ever read back whole and rewritten whole, never queried by element.
  watchedIntervals Json  @default("[]")
  // Sum of the intervals above, denormalized so progress summaries are an aggregate
  // over an Int column instead of a per-row Json parse.
  coveredSecs  Int      @default(0)
  // coveredSecs / durationSecs, 0-100, snapshotted so the ratio survives a later
  // duration correction on the platform video.
  percent      Int      @default(0)

  // --- document reading position ---
  lastPage     Int?
  pageCount    Int?

  // Learner-asserted completion, separate from the derived kind. Opening a PDF is not
  // reading it, so a document can ONLY reach COMPLETED through this column.
  markedCompleteAt DateTime?
  completedAt      DateTime?

  firstAccessedAt DateTime @default(now())
  lastAccessedAt  DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([userId, videoId])
  @@unique([userId, documentId])
  @@index([schoolId, userId, lastAccessedAt])   // history feed, newest first
  @@index([schoolId, userId, status])           // progress filters + summaries
  @@index([videoId])
  @@index([documentId])
}
```

Migration adds by hand (Prisma cannot express either):

```sql
ALTER TABLE "ResourceActivity" ADD CONSTRAINT "ResourceActivity_one_resource"
  CHECK (num_nonnulls("videoId", "documentId") = 1);
```

Both `@@unique` pairs are nullable-column uniques, which Postgres treats as distinct on NULL — that is exactly what is wanted: they constrain only the rows of the matching type.

**`NOT_STARTED` is never stored.** A resource with no row is not started. This keeps the table proportional to real activity rather than to `users × resources`, and progress summaries compute `notStarted = reachableCount - startedCount`.

### 1.2 `Bookmark` and `Collection`

```prisma
// Teacher-owned named grouping ("Plants — Monday Lesson"). Students never create one;
// their Saved list is simply the bookmarks whose collectionId is null.
model Collection {
  id        String     @id @default(cuid())
  schoolId  String
  school    School     @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  ownerId   String
  owner     User       @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  name      String
  sortOrder Int
  bookmarks Bookmark[]
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt

  @@unique([ownerId, name])
  @@index([schoolId, ownerId])
}

model Bookmark {
  id           String       @id @default(cuid())
  schoolId     String
  school       School       @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  userId       String
  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  resourceType ResourceType
  videoId      String?
  video        Video?       @relation(fields: [videoId], references: [id], onDelete: Cascade)
  documentId   String?
  document     Document?    @relation(fields: [documentId], references: [id], onDelete: Cascade)
  // Null = saved but uncollected. SetNull, not Cascade: deleting a collection must
  // un-file its items, never silently unsave them.
  collectionId String?
  collection   Collection?  @relation(fields: [collectionId], references: [id], onDelete: SetNull)
  createdAt    DateTime     @default(now())

  @@unique([userId, videoId])
  @@unique([userId, documentId])
  @@index([schoolId, userId, createdAt])
  @@index([collectionId])
}
```

Same `num_nonnulls(...) = 1` CHECK as `ResourceActivity`.

### 1.3 `Task` and `TaskAssignment`

```prisma
enum TaskStatus {
  ACTIVE
  CANCELLED
}

model Task {
  id           String       @id @default(cuid())
  schoolId     String
  school       School       @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  createdById  String
  createdBy    User         @relation("TasksCreated", fields: [createdById], references: [id], onDelete: Cascade)

  title        String
  instructions String?
  dueAt        DateTime?

  resourceType ResourceType
  videoId      String?
  video        Video?       @relation(fields: [videoId], references: [id], onDelete: Restrict)
  documentId   String?
  document     Document?    @relation(fields: [documentId], references: [id], onDelete: Restrict)

  status       TaskStatus   @default(ACTIVE)
  cancelledAt  DateTime?

  // What the teacher picked, kept for the edit screen and for "assign to the whole
  // class" re-fan-out when a student joins later. Recipients are still materialized
  // into TaskAssignment at create time (see below).
  sectionId    String?
  section      Section?     @relation(fields: [sectionId], references: [id], onDelete: Restrict)

  assignments  TaskAssignment[]
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt

  @@index([schoolId, createdById, createdAt])
  @@index([schoolId, status, dueAt])
}

model TaskAssignment {
  id         String         @id @default(cuid())
  schoolId   String
  school     School         @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  taskId     String
  task       Task           @relation(fields: [taskId], references: [id], onDelete: Cascade)
  studentId  String
  student    User           @relation("TasksReceived", fields: [studentId], references: [id], onDelete: Cascade)

  status     ProgressStatus @default(NOT_STARTED)
  completedAt DateTime?
  // Set at fan-out when the student had ALREADY completed the resource. The task is
  // not auto-closed on this basis — the teacher decides what it means — but every
  // report and the student's own list flags it.
  preCompletedAt DateTime?

  reminders  TaskReminder[]
  createdAt  DateTime       @default(now())

  @@unique([taskId, studentId])
  @@index([schoolId, studentId, status])
  @@index([taskId, status])
}

// Dedupe ledger. One reminder per assignment per calendar day, enforced by the DB
// rather than by a service-level "did I already?" check that two concurrent senders
// would both pass.
model TaskReminder {
  id               String         @id @default(cuid())
  schoolId         String
  school           School         @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  taskAssignmentId String
  taskAssignment   TaskAssignment @relation(fields: [taskAssignmentId], references: [id], onDelete: Cascade)
  sentById         String
  sentBy           User           @relation(fields: [sentById], references: [id], onDelete: Cascade)
  // Date-only (UTC midnight) so the unique below means "once per day".
  sentOn           DateTime       @db.Date
  createdAt        DateTime       @default(now())

  @@unique([taskAssignmentId, sentOn])
  @@index([schoolId, createdAt])
}
```

**Recipients are materialized, not computed.** A `TaskAssignment` row per student at create time is what makes "completion summary for this task" an indexed `groupBy` rather than a live join against enrollment. The cost is that a student enrolled *after* a class-wide task was created has no row; `TasksService` back-fills on enrollment change (see §5.4) rather than pretending the set is dynamic.

### 1.4 `Notification`, `NotificationPreference`, `DeviceToken`

```prisma
enum NotificationType {
  TASK_ASSIGNED
  TASK_REMINDER
  TASK_DUE_SOON
  TEACHER_DAILY_SUMMARY
}

model Notification {
  id        String           @id @default(cuid())
  schoolId  String
  school    School           @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  userId    String
  user      User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  type      NotificationType
  title     String
  body      String
  // Deep-link payload for the client: { taskId?, videoId?, documentId? }.
  data      Json             @default("{}")
  readAt    DateTime?
  createdAt DateTime         @default(now())

  @@index([schoolId, userId, createdAt])
  @@index([schoolId, userId, readAt])
}

model NotificationPreference {
  id                String   @id @default(cuid())
  schoolId          String
  school            School   @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  userId            String   @unique
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  inAppEnabled      Boolean  @default(true)
  pushEnabled       Boolean  @default(true)
  taskRemindersEnabled Boolean @default(true)
  // Minutes before dueAt for the TASK_DUE_SOON nudge. Null disables it.
  dueSoonLeadMins   Int?     @default(1440)
  // Local-time window in which push is suppressed, e.g. 21:00-07:00. Stored as minutes
  // from midnight; null/null means no quiet hours.
  quietFromMins     Int?
  quietToMins       Int?
  updatedAt         DateTime @updatedAt

  @@index([schoolId])
}

model DeviceToken {
  id         String   @id @default(cuid())
  schoolId   String
  school     School   @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  platform   String   // "ios" | "android"
  // The FCM/APNs registration token. Unique so a device that re-registers under a
  // different account moves rather than duplicates.
  token      String   @unique
  lastSeenAt DateTime @default(now())
  createdAt  DateTime @default(now())

  @@index([schoolId, userId])
}
```

### 1.5 Registration and migration checklist

- Add `ResourceActivity`, `Bookmark`, `Collection`, `Task`, `TaskAssignment`, `TaskReminder`, `Notification`, `NotificationPreference`, `DeviceToken` to **`TENANT_SCOPED_MODELS`** in `apps/api/src/prisma/tenant-scoped-models.ts`. `tenant-model-coverage.spec.ts` fails the build otherwise.
- `npm run db:migrate`, commit the migration alongside the schema, then `DATABASE_URL=<test-db-url> npx prisma migrate deploy` for the e2e database.
- Hand-write the three `num_nonnulls` CHECK constraints into the generated migration.
- `Document.pageCount` does not exist today and the PDF proxy work (`docs/2026-08-12-mobile-video-document-viewer-prd.md`) needs it too. Add `pageCount Int?` to `Document`, populated at ingest; `ResourceActivity.pageCount` is a snapshot so a re-upload cannot retroactively change a stored percentage.

**Nested-write warning.** `School` gains back-relations to every table above, so `School` queries now enter the tenant guard's nested walker. Never `include` these from a `School` root and never nest-write them through `school.update(...)` — the guard throws `UnsupportedTenantNestedOperationError` by design. Write against the child model.

---

## 2. Module layout

Two new feature modules plus one shared service. No new patterns.

```
apps/api/src/
├── activity/                       # NEW — progress, history, bookmarks, collections, search
│   ├── activity.module.ts
│   ├── progress.controller.ts      # /me/progress/*
│   ├── progress.service.ts
│   ├── watch-intervals.util.ts     # merge/clamp/cover — pure, heavily unit-tested
│   ├── history.controller.ts       # /me/activity, /me/continue
│   ├── history.service.ts
│   ├── bookmarks.controller.ts     # /me/bookmarks, /me/collections
│   ├── bookmarks.service.ts
│   ├── collections.service.ts
│   ├── library-search.controller.ts# /library/search
│   ├── library-search.service.ts
│   ├── home.controller.ts          # /home/student, /home/teacher
│   ├── home.service.ts
│   ├── activity-access.policy.ts
│   ├── dto/ entities/
│   └── *.spec.ts
├── tasks/                          # NEW — assignment, task status, class reports
│   ├── tasks.module.ts
│   ├── tasks.controller.ts         # teacher: create/edit/cancel/report
│   ├── student-tasks.controller.ts # student: /me/tasks
│   ├── tasks.service.ts
│   ├── task-fanout.service.ts
│   ├── task-progress.service.ts    # class + individual reports
│   ├── tasks-access.policy.ts
│   ├── dto/ entities/
│   └── *.spec.ts
├── notifications/                  # NEW
│   ├── notifications.module.ts
│   ├── notifications.controller.ts # /me/notifications, /me/notification-preferences, /me/devices
│   ├── notifications.service.ts    # write + fan-out
│   ├── push/push.service.ts        # Adapter over FCM/APNs — vendor never leaks out
│   ├── daily-summary.service.ts    # @Cron
│   └── dto/ entities/
└── teachers/
    └── teacher-class-scope.service.ts   # NEW, exported from TeachersModule
```

`ActivityModule` exports `ProgressService` (Tasks needs it). `TasksModule` exports `TasksService` (Notifications' daily summary needs it). `TeachersModule` exports `TeacherClassScopeService`. Nothing exports a repository.

---

## 3. Progress rules — the part that has to be right

Lives in `activity/watch-intervals.util.ts` (pure functions) and `progress.service.ts` (persistence + entitlement).

### 3.1 Video completion is unique coverage, not position

A client sends **intervals actually played**, not a position:

```
PUT /me/progress/videos/:id
{ "positionSecs": 412, "intervals": [[380, 412]], "clientUpdatedAt": "2026-09-11T10:02:03Z" }
```

The service:

1. Resolves the video through `VideosService.findPlayableVisibleTo(id, actor)` → `404` if unreachable. Progress is not a back door into the library.
2. **Clamps each interval against wall-clock.** `sum(newIntervalLengths) <= (now - row.updatedAt) * MAX_PLAYBACK_RATE + PROGRESS_CLOCK_SLACK_SECS`. A beat claiming 40 minutes of coverage 15 seconds after the last one is truncated, not trusted. This is what stops a scripted client from completing a library.
3. Merges into `watchedIntervals` (union of closed intervals, sorted, adjacent-merged with a 1s join tolerance), recomputes `coveredSecs`, and `percent = round(coveredSecs / durationSecs * 100)`.
4. `status = COMPLETED` once `percent >= VIDEO_COMPLETION_PERCENT` (config, default **85**), and `completedAt` is stamped once and never moved.
5. Updates `positionSecs` **only if** `clientUpdatedAt` is newer than the stored `updatedAt` — the cross-device last-write-wins rule for position.

**Seeking to the end cannot complete a video**, because a seek contributes no interval; only played ranges do. Rewatching contributes nothing new, because the union is idempotent. That idempotence is also what makes concurrent beats from two devices safe: union is commutative, so the merge needs no ordering guarantee — unlike `positionSecs`, which does and gets the `clientUpdatedAt` guard.

The whole read-merge-write runs inside `prisma.$transaction` with the row selected `FOR UPDATE` (Prisma: the transaction plus the `@@unique` upsert), so two devices beating simultaneously cannot lose one another's intervals.

### 3.2 Documents: opening is not reading

```
PUT  /me/progress/documents/:id      { "lastPage": 7, "pageCount": 24, "clientUpdatedAt": ... }
POST /me/progress/documents/:id/complete
DELETE /me/progress/documents/:id/complete
```

- The `PUT` records position only. It sets `status = IN_PROGRESS` and never `COMPLETED`.
- `COMPLETED` for a document requires the explicit `POST`, which stamps `markedCompleteAt` **and** `completedAt`. The two columns stay separate because `markedCompleteAt` records *who asserted it* while `completedAt` is the derived-or-asserted timestamp every report reads — keeping them merged would make "how did this complete?" unanswerable.
- The `DELETE` un-completes (students change their minds; the teacher report must reflect reality).

### 3.3 Progress summaries

`GET /me/progress/summary` returns per-subject rollups over the actor's resolved scope:

```
[{ subjectId, subjectName, gradeLevelId, total, notStarted, inProgress, completed, percent }]
```

`total` is the count of resources inside the actor's `ActorContentScopeService` scope — so a summary automatically shrinks when an entitlement lapses, and `notStarted = total - (inProgress + completed)` needs no stored rows.

### 3.4 New config vars

Added to `config/env.validation.ts` (class-validator, as with everything else — never read `process.env` downstream):

| Var | Default | Bound |
| --- | --- | --- |
| `VIDEO_COMPLETION_PERCENT` | `85` | `@Min(50) @Max(100)` |
| `PROGRESS_CLOCK_SLACK_SECS` | `10` | `@Min(0) @Max(120)` |
| `MAX_PLAYBACK_RATE` | `2` | `@Min(1) @Max(4)` |
| `PUSH_PROVIDER` | `none` | `none \| fcm` |
| `FCM_SERVICE_ACCOUNT_JSON` | — | required when `PUSH_PROVIDER=fcm` |
| `TEACHER_DAILY_SUMMARY_CRON` | `0 7 * * *` | valid cron |

---

## 4. Access control

### 4.1 Content reach — unchanged, reused everywhere

Every resource-touching route resolves through `ActorContentScopeService`. No new surface may be wider than `GET /videos`. In particular, `GET /library/search` filters on the resolved scope **before** applying the text query, so an unreachable title can never appear even as a name.

### 4.2 Class reach — new, and deliberately narrower than today's roster

`TeacherClassScopeService` (in `teachers/`) answers **"which sections and students may this teacher act on?"**:

```ts
resolveSections(actor): Promise<string[]>   // section ids from section-bearing TeacherAssignments
resolveStudents(actor): Promise<string[]>   // ACTIVE enrollments in those sections
includesStudent(actor, studentId): Promise<boolean>
```

- **A teacher with no section-bearing assignment can assign nothing and see no student report.** This fails closed, unlike `ActorContentScopeService`'s lenient teacher fallback — the reason for that leniency (don't blank a library during onboarding) does not transfer to writing tasks against real students.
- `GET /students` and `GET /sections` stay school-wide for now (the known breadth called out in `docs/2026-09-11-teacher-student-features.md`). Narrowing them is a separate change; **tasks and reports must not wait for it**.
- Out-of-scope student → `404`, not `403`.

### 4.3 Assignable resources

`TasksService.create` validates, in order, before any write:

1. The resource is reachable by the **teacher** (`ActorContentScopeService`), else `404`.
2. The resource's curriculum `audience` is `STUDENT`, else `400` — assigning teacher-audience material would hand students a resource their own scope refuses to open.
3. Every recipient is inside `TeacherClassScopeService.resolveStudents`, else `404`.
4. Every recipient's own scope includes the curriculum, else `422` listing the affected students — a grade-mismatched recipient is a teacher mistake worth surfacing, not a silent drop.

### 4.4 Ownership policies

Per the established shape (`users/users-access.policy.ts`), one `ResourceAccessPolicy` per feature, used through `requireReadable`:

- `activity-access.policy.ts` — an activity row, bookmark or collection is readable only by its own user/owner. There is no "read another user's activity" path in `ActivityModule` at all; teacher-facing student progress lives in `TasksModule` and goes through `TeacherClassScopeService`.
- `tasks-access.policy.ts` — a task is readable by its creator, and by a student holding a `TaskAssignment` for it. Nobody else, including other teachers in the same school.

### 4.5 Role gating

| Surface | Roles |
| --- | --- |
| Progress writes, history, continue, bookmarks, search | `SCHOOL_ADMIN, TEACHER, STUDENT` — matching the existing library routes, so one player/reader component works for every role that can open content |
| Collections | `TEACHER` (students get uncollected bookmarks only) |
| `/home/student` | `STUDENT` |
| `/home/teacher` | `TEACHER` |
| Task create/edit/cancel/report | `TEACHER` |
| `/me/tasks` | `STUDENT` |
| Notifications, preferences, devices | `TEACHER, STUDENT` |

`SUPER_ADMIN` appears on none of these: platform authors have no school, so a tenant-scoped activity row cannot exist for them, and the tenant guard would throw `MissingTenantContextError` rather than return an empty list.

---

## 5. Routes

Every row below needs a `MATRIX` entry in `rbac-matrix.e2e-spec.ts` and full Swagger decorators.

### 5.1 Progress & history

| Method | Path | Roles | Notes |
| --- | --- | --- | --- |
| `PUT` | `/me/progress/videos/:id` | ADMIN/TEACHER/STUDENT | heartbeat; body `{ positionSecs, intervals[], clientUpdatedAt }` |
| `PUT` | `/me/progress/documents/:id` | ″ | `{ lastPage, pageCount?, clientUpdatedAt }` |
| `POST` | `/me/progress/documents/:id/complete` | ″ | learner-asserted |
| `DELETE` | `/me/progress/documents/:id/complete` | ″ | undo |
| `GET` | `/me/progress/summary` | ″ | per-subject rollup |
| `GET` | `/me/activity` | ″ | history feed; `?type=VIDEO\|DOCUMENT&status=&cursor=&limit=` |
| `GET` | `/me/continue` | ″ | `IN_PROGRESS`, `lastAccessedAt desc`, capped at 10 |

### 5.2 Bookmarks & collections

| Method | Path | Roles |
| --- | --- | --- |
| `GET` / `POST` | `/me/bookmarks` | ADMIN/TEACHER/STUDENT |
| `DELETE` | `/me/bookmarks/:id` | ″ |
| `GET` / `POST` | `/me/collections` | TEACHER |
| `PATCH` / `DELETE` | `/me/collections/:id` | TEACHER |
| `POST` / `DELETE` | `/me/collections/:id/items` | TEACHER (moves an existing bookmark in/out) |

### 5.3 Search & home

| Method | Path | Roles | Notes |
| --- | --- | --- | --- |
| `GET` | `/library/search` | ADMIN/TEACHER/STUDENT | `?q=&gradeLevelId=&subjectId=&contentNodeId=&type=&audience=&progress=&cursor=` |
| `GET` | `/home/student` | STUDENT | continue · tasks-due · recent · saved, in one round trip |
| `GET` | `/home/teacher` | TEACHER | classes · active tasks · completion summary · continue-preparation |

**Search implementation:** start with case-insensitive `contains` across `Video.title`, `Video.description`, `Document.title`, `ContentNode.title`, filtered to the resolved curriculum ids. It is correct and needs no extension. When latency demands it, the upgrade is a `pg_trgm` GIN index plus `ILIKE`, or `tsvector` columns — **not** a search service. `progress=` filters by joining `ResourceActivity` on the same `userId` (`status` in, or absent for `NOT_STARTED`).

Home endpoints are single-round-trip aggregates on purpose: the mobile client renders one screen and should not fan out five calls on cold start.

### 5.4 Tasks

| Method | Path | Roles | Notes |
| --- | --- | --- | --- |
| `POST` | `/tasks` | TEACHER | `{ title, instructions?, dueAt?, resourceType, resourceId, sectionId? , studentIds? }` |
| `GET` | `/tasks` | TEACHER | tasks this teacher created; `?status=&sectionId=&subjectId=` |
| `GET` | `/tasks/:id` | TEACHER | includes recipient + completion counts |
| `PATCH` | `/tasks/:id` | TEACHER | title, instructions, dueAt only — **never the resource or the recipients** |
| `POST` | `/tasks/:id/cancel` | TEACHER | soft; assignments stay for the record |
| `GET` | `/tasks/:id/progress` | TEACHER | per-student rows, `?status=` |
| `GET` | `/tasks/:id/students/:studentId` | TEACHER | that student's `ResourceActivity` for the task's resource |
| `POST` | `/tasks/:id/remind` | TEACHER | reminds every pending recipient, deduped per day |
| `GET` | `/teacher/class-progress` | TEACHER | rollup `?sectionId=&subjectId=&taskId=` |
| `GET` | `/me/tasks` | STUDENT | `?status=&overdue=` |
| `GET` | `/me/tasks/:id` | STUDENT | instructions + resource + own progress |

**Why `PATCH` refuses the resource and the recipient set:** changing either would invalidate every `TaskAssignment.status` already derived from the old resource, and silently re-fan-out. Both are a cancel-and-recreate.

**Fan-out** (`task-fanout.service.ts`) runs inside the create transaction: resolve recipients (section → ACTIVE enrollments, or the explicit `studentIds`), insert `TaskAssignment` rows with `createMany`, snapshot `preCompletedAt` from each student's existing `ResourceActivity`, and enqueue one `TASK_ASSIGNED` notification each. A partial fan-out is worse than a failed create, so it is one `$transaction`.

**Back-fill on enrollment.** `EnrollmentsService` calls `TasksService.backfillForNewEnrollment(userId, sectionId)` when a student joins a section, creating assignments for that section's still-`ACTIVE`, not-yet-due tasks. A direct exported-service call, not an event — a student who silently misses their class's homework is a correctness bug, and control flow that must happen belongs in the open.

### 5.5 Notifications

| Method | Path | Roles |
| --- | --- | --- |
| `GET` | `/me/notifications` | TEACHER/STUDENT (`?unread=&cursor=`) |
| `POST` | `/me/notifications/:id/read` | ″ |
| `POST` | `/me/notifications/read-all` | ″ |
| `GET` / `PATCH` | `/me/notification-preferences` | ″ |
| `POST` | `/me/devices` | ″ (register push token) |
| `DELETE` | `/me/devices/:id` | ″ |

- Every notification is written in-app **first**; push is a best-effort delivery of a row that already exists, so a failed push never loses the alert.
- `PushService` is an **Adapter** over FCM/APNs (`common` pattern: wrap every third-party SDK behind an interface you own). `PUSH_PROVIDER=none` gives a no-op implementation, which is what dev and e2e use.
- `daily-summary.service.ts` uses `@nestjs/schedule` with `TEACHER_DAILY_SUMMARY_CRON` to send each teacher one `TEACHER_DAILY_SUMMARY`. It is **per-school-tenant** work running outside a request, so it resolves each school explicitly and runs under `TenantContextService` per school — it must not be written as an ambient cross-tenant sweep.
- `DELETE /me/devices/:id` is also called on logout by the client.

---

## 6. Task status derivation

The rule: **a task's status is a projection of the linked resource's progress, never independently editable.**

`ProgressService`, in the same transaction that flips a `ResourceActivity` to `COMPLETED` or `IN_PROGRESS`, calls `TasksService.syncForResource(userId, resourceType, resourceId, status)`, which updates every `ACTIVE` `TaskAssignment` for that student and resource.

A direct in-transaction call rather than an event emitter, deliberately: an event would let a student's task stay "not started" after they finished the video if the listener failed, and the repo's own guidance reserves the emitter for *genuine side effects* (an email), not for state that must be consistent.

Students therefore never `POST /me/tasks/:id/complete` for videos. For documents, marking the document complete *is* the completion action, and the task follows.

`preCompletedAt` is surfaced everywhere the task is: the student list shows "already completed before this was assigned", and the teacher's report counts them separately so a 100% completion rate that was 100% on day one is legible as such.

---

## 7. Cross-device sync

| Data | Conflict rule |
| --- | --- |
| `watchedIntervals` / `coveredSecs` | Union — commutative and idempotent, so ordering never matters |
| `positionSecs` | Last-write-wins on `clientUpdatedAt` |
| `lastPage` | Last-write-wins on `clientUpdatedAt` |
| `markedCompleteAt` / `completedAt` | First write wins; stamped once, never moved by a later beat |
| Bookmarks | Server-authoritative; `@@unique` makes a re-save a no-op upsert |
| Task status | Derived, never client-supplied |

Clients replay queued offline beats in timestamp order; the union rule means a replayed beat is safe even if a newer one already landed. `clientUpdatedAt` more than `PROGRESS_CLOCK_SLACK_SECS` in the future is clamped to `now` — a device with a wrong clock must not pin `positionSecs` forever.

---

## 8. Testing

**Unit (Prisma mocked), mandatory:**

- `watch-intervals.util.spec.ts` — merges overlapping and adjacent ranges; is idempotent under replay; clamps a beat claiming more time than elapsed; **completes at the threshold and not by seeking to the end**.
- `progress.service.spec.ts` — a document reaches `COMPLETED` only via the explicit mark; `positionSecs` ignores a stale `clientUpdatedAt`; `completedAt` never moves.
- `tasks.service.spec.ts` — refuses a `TEACHER`-audience resource; refuses a student outside class scope; fan-out snapshots `preCompletedAt`; `PATCH` refuses a resource change.
- `teacher-class-scope.service.spec.ts` — a teacher with no section-bearing assignment resolves to an empty student set.
- `notifications.service.spec.ts` — the reminder dedupe; quiet hours suppress push but never the in-app row.

**E2E (`apps/api/test/`), mandatory:**

- `rbac-matrix.e2e-spec.ts` — a row for every route above, in the same commit.
- `activity.e2e-spec.ts` — `PUT /me/progress/videos/:id` on an unentitled video returns `404`; `teacher-b@` (unentitled school) sees an empty search and empty history.
- `tasks.e2e-spec.ts` — a teacher in `demo-school` cannot assign to a `demo-school-b` student (`404`); a student cannot read another student's task; completing the video flips the task.
- **Cross-tenant proof is required** for each of `ResourceActivity`, `Bookmark`, `Task` — one tenant must never read another's rows.

Fixtures go in `test/utils/content-fixtures.ts` (never `seed.ts`). The existing asymmetry — `demo-school` holds exactly one entitlement, `demo-school-b` none — is what makes the scope assertions meaningful; do not grant more.

---

## 9. Build order

Each phase ships independently and leaves the app working.

| Phase | Delivers | Unblocks |
| --- | --- | --- |
| **1 — Progress & history** | `ResourceActivity`, `ProgressService`, `watch-intervals.util`, `/me/progress/*`, `/me/activity`, `/me/continue`, `Document.pageCount` | Continue Watching/Reading, Video & Document History, Learning Progress, My Preparation Progress |
| **2 — Home screens** | `/home/student`, `/home/teacher`, `/me/progress/summary` | Student My Home, Teacher My Dashboard (minus task tiles) |
| **3 — Bookmarks & search** | `Bookmark`, `Collection`, `/me/bookmarks`, `/me/collections`, `/library/search` | Saved Items, Saved Resources & Collections, Search and Filters |
| **4 — Assignments** | `TeacherClassScopeService`, `Task`, `TaskAssignment`, fan-out, status derivation, `/tasks/*`, `/me/tasks` | Assign Learning Resources, Manage Assigned Tasks, My Tasks |
| **5 — Reports & reminders** | `TaskReminder`, `Notification`, `NotificationPreference`, `DeviceToken`, `PushService`, daily summary, `/tasks/:id/progress`, `/teacher/class-progress` | Class Progress, Individual Student Progress, Notifications & Reminders |

Phase 4 depends on phase 1 (status derivation needs `ResourceActivity`); phases 2 and 3 are independent of each other.

---

## 10. Open decisions

1. **Does `SCHOOL_ADMIN` accrue progress?** The plan says yes, purely so one player component serves every role. If an admin's watch history polluting reports is unwanted, exclude them from `ProgressService` writes and give the player a role-aware no-op instead.
2. **Roster narrowing.** `GET /students` / `GET /sections` remain school-wide. Tasks sidestep this with `TeacherClassScopeService`, but the inconsistency ("I can see 400 students, I can assign to 30") is visible to users and should be closed.
3. **`pageCount` at ingest.** Needs a PDF page-count read in `DocumentsService` on confirm. Coordinate with the PDF-proxy workstream in `docs/2026-08-12-mobile-video-document-viewer-prd.md` rather than implementing it twice.
4. **Retention.** `Notification` and `TaskReminder` grow without bound. A pruning job (90 days) belongs in phase 5, not later.
