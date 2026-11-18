# Mobile plan — Learning activity, tasks & notifications (Flutter)

**Date:** 2026-09-11
**Scope:** `apps/mobile` (Flutter). TEACHER and STUDENT only.
**Companion:** `docs/2026-09-11-learning-activity-backend-plan.md` — every endpoint named here is defined there.
**Builds on:** `docs/2026-08-10-mobile-app-feature-list.md` (app shell, auth, token handling, entitlement behaviour) and `docs/2026-08-12-mobile-video-document-viewer-prd.md` (player and PDF reader). Neither is restated; read them first.

---

## 0. Ground rules carried forward

| Rule | Consequence here |
| --- | --- |
| The app is the token holder — no BFF | Every call in this plan carries `Authorization: Bearer <accessToken>`; the Dio interceptor handles `401 → POST /auth/refresh → retry once`. |
| Entitlements are server-side only | History, search, saved items and tasks are already scoped. The app never filters "can I see this" locally, and never caches a resource list past logout. |
| 404 means "gone **or** not yours" | Never render "deleted" vs "no access" differently. A missing item is simply removed from the local list. |
| The playback JWT is the `?t=` query param inside `manifestUrl`, TTL ≤ 600s | Progress beats are a **separate, bearer-authenticated** call to `/me/progress/videos/:id`. Never attach the playback token to them, and never assume a valid playback token implies a valid session. |
| Documents are rendered in-memory via the backend proxy, not downloaded | "Continue Reading" restores a page number, not a file. |

---

## 1. App structure

```
apps/mobile/lib/
├── core/
│   ├── api/            # Dio client, auth interceptor, error mapping (exists)
│   ├── db/             # Drift — local cache + outbox
│   ├── sync/           # outbox worker, connectivity, conflict rules
│   └── push/           # FCM/APNs registration, notification tap routing
├── features/
│   ├── auth/                    (exists)
│   ├── library/                 (exists — curricula, video, document)
│   ├── progress/       # beat emitters, progress models, badges
│   ├── history/        # Videos / Documents tabs, Continue rails
│   ├── saved/          # bookmarks + teacher collections
│   ├── search/         # query + filter sheet
│   ├── tasks/          # student list, teacher authoring + reports
│   ├── home/           # student Home, teacher Dashboard
│   └── notifications/  # inbox, preferences
└── shell/              # role-branched bottom nav
```

State: the pattern already chosen in `apps/mobile` (Riverpod assumed). Local persistence: **Drift** — the outbox needs indexed queries and transactional deletes, which a key-value store cannot give.

### Role-branched navigation

Decided at login from `GET /users/me` `role`, not per-screen:

- **Student:** Home · My Subjects · My Tasks · Saved · Profile
- **Teacher:** Home · Library · My Classes · Tasks · Profile

One `AppShell` widget, two tab tables. Deep links from notifications resolve against the active role's table; a link a role cannot open falls back to Home rather than erroring.

---

## 2. The sync engine — build this first

Everything else in this plan depends on it. Three pieces in `core/`.

### 2.1 Local schema (Drift)

| Table | Purpose |
| --- | --- |
| `activity_cache` | Mirror of the server's `ResourceActivity` for resources the user has touched: `resourceId`, `type`, `positionSecs`, `lastPage`, `percent`, `status`, `lastAccessedAt`, `serverUpdatedAt` |
| `outbox` | Pending writes: `id`, `kind`, `payload` (JSON), `clientUpdatedAt`, `attempts`, `nextAttemptAt` |
| `bookmark_cache`, `task_cache`, `notification_cache` | Read caches for offline list rendering, each with `fetchedAt` |

`activity_cache` is written **optimistically** the moment the player or reader moves, so the UI never waits on the network. `outbox` is what eventually reconciles it.

### 2.2 Outbox

Every mutating call this plan makes goes through the outbox, never straight to Dio:

| Kind | Endpoint | Coalescing |
| --- | --- | --- |
| `videoProgress` | `PUT /me/progress/videos/:id` | Merge by `resourceId`: union the intervals, keep the newest `positionSecs`/`clientUpdatedAt` |
| `docProgress` | `PUT /me/progress/documents/:id` | Merge by `resourceId`: keep newest `lastPage` |
| `docComplete` / `docUncomplete` | `POST`/`DELETE …/complete` | Last one wins; cancels an earlier opposite entry for the same doc |
| `bookmarkAdd` / `bookmarkRemove` | `POST`/`DELETE /me/bookmarks` | Last one wins per resource |
| `notificationRead` | `POST /me/notifications/:id/read` | Dedupe |

Rules:

- **Stamp `clientUpdatedAt` at the moment of the user action**, not at send time. The server's last-write-wins comparison is meaningless otherwise.
- Flush on: connectivity regained, app foreground, player pause/stop/dispose, every 30s while a beat source is active, and app background (with a short `WorkManager`/`BGTaskScheduler` grace window).
- Retry with exponential backoff (`nextAttemptAt`), capped. A `4xx` that is not `408`/`429` is **discarded, not retried** — a `404` means the resource left the user's scope, and replaying it forever would wedge the queue.
- Cap the queue (e.g. 500 entries) and drop oldest-first; coalescing keeps it far below that in practice.

### 2.3 Conflict handling

The server rules (backend plan §7) are what make an offline replay safe. The client's obligations are narrow:

- **Send intervals, never a computed percentage.** The union is the server's job; a client-computed percent would be unverifiable and forgeable.
- **Never resend the full interval history** — only ranges played since the last successful flush. The server merges; resending everything wastes bandwidth and trips the clock clamp.
- On a successful flush, overwrite `activity_cache` with the server's response. The server is authoritative for `status`, `percent` and `completedAt`; the client is only ever authoritative for "what just happened on this device".

---

## 3. Video: Continue Watching & completion

Extends the player from the viewer PRD.

**Interval capture.** A `PlaybackTracker` subscribes to the player's position stream at ~1s and accumulates a *contiguous* range. It closes and pushes the range on: seek, pause, rate change, buffering stall > 2s, dispose. This is what makes seeking to the end contribute nothing — a seek closes the current range and opens a new one at the destination.

**Beat cadence:** flush accumulated intervals every **15s** of actual playback, plus on every range close, plus on dispose. Roughly 4 calls/minute/viewer; each carries a merged payload, so a lost beat costs at most 15s of coverage and is re-sent from the outbox.

**Resume.** On open, read `positionSecs` from `activity_cache`, then reconcile against the server value in the `GET /videos/:id` / home payload. If they differ by more than 10s and the server's is newer, show a **"Resume from 6:52 · Start over"** chooser rather than silently jumping — the cross-device case is exactly when a silent jump feels broken. Below 10s, resume silently.

**Completion UI.** The completion threshold is server config (`VIDEO_COMPLETION_PERCENT`); the client **must not hardcode 90%**. Render the badge from the server's `status`, and treat the local `percent` as provisional until a flush confirms.

**Token vs. progress.** The playback token re-mint (at 80% of TTL, or on auth error) and the progress beat are independent. A failed re-mint must not drop queued beats; a failed beat must not interrupt playback.

---

## 4. Documents: Continue Reading

- The reader reports `lastPage` on page settle (debounced 1.5s — not on every swipe) and on dispose.
- Reopening restores `lastPage` directly, with no chooser: a page is cheap to correct, a video position is not.
- **"Mark as read"** is an explicit control in the reader's app bar, and it is the *only* way a document reaches `COMPLETED`. The UI must never imply that finishing the last page completed it — that is the "opening a PDF does not mean it was read" rule, surfaced.
- Un-marking is available from the same control and from the history row.
- `pageCount` comes from the server; until the `Document.pageCount` work lands (backend plan §10.3), show "page 7" rather than "page 7 of 24" instead of guessing.

---

## 5. Screens

### 5.1 Student Home — `GET /home/student`

One call, four rails:

1. **Continue Learning** — horizontal cards, each with a progress bar and "resume at" label. Video and document items in one rail, ordered by `lastAccessedAt`.
2. **My Tasks** — up to 3 due-soonest open tasks; overdue ones in the error colour; "View all" → Tasks tab.
3. **Recently Viewed** — most recent items; tapping the header opens History with the matching tab.
4. **Saved Items** — most recent bookmarks; header → Saved tab.

Empty states matter: a student with no active enrollment has an empty library **by design**. Render "Your class hasn't been set up yet — ask your teacher", never an error.

### 5.2 History — `GET /me/activity`

Two tabs, **Videos** and **Documents**, reachable from Home and from the Profile menu.

- Video row: thumbnail, title, subject · chapter, last-watched date, progress bar, status chip.
- Document row: title, subject · chapter, last-opened date, "page 7", status chip.
- Filter chips: `All / In progress / Completed`, mapping to `?status=`.
- Cursor pagination, infinite scroll. Offline: render `activity_cache` with a "showing saved copy" banner.

### 5.3 Learning Progress (student) / My Preparation Progress (teacher)

Same widget, different data source — both `GET /me/progress/summary`, which is already actor-scoped. Per-subject cards with a three-segment bar (Not started / In progress / Completed) and counts; tapping a subject filters History.

The teacher's version is explicitly labelled **"My preparation"** and kept on a different tab from class reports, so the two progress notions are never confused on screen.

### 5.4 Saved — `GET /me/bookmarks`, `GET /me/collections`

- **Student:** a flat grid of saved videos and documents, with a type filter. Bookmark toggle lives in the player app bar, the reader app bar, and every list row's overflow menu.
- **Teacher:** a **Collections** tab (named groups, e.g. "Plants — Monday Lesson") plus an **Unfiled** tab. Create/rename/delete a collection; move a bookmark in or out. Deleting a collection unfiles its items — never unsaves them; say so in the confirm dialog.

Bookmark toggles are optimistic and go through the outbox.

### 5.5 Search — `GET /library/search`

One search field in the Library/My Subjects app bar plus a filter bottom sheet.

| Filter | Student | Teacher |
| --- | --- | --- |
| Subject | ✅ | ✅ |
| Grade | — (single grade) | ✅ |
| Chapter / topic | ✅ | ✅ |
| Resource type | ✅ | ✅ |
| Audience (Students / Teachers) | — (pinned to STUDENT) | ✅ |
| Progress status | ✅ | ✅ |

Debounce 300ms, cancel the in-flight request on keystroke. Search is **online-only** in v1 — surface an offline state rather than searching a partial cache, which would silently hide results.

### 5.6 My Tasks (student) — `GET /me/tasks`

- Sections: **Overdue**, **Due soon**, **Completed**.
- Row: resource thumbnail, title, teacher name, due date, status chip, and a **"Completed before this was assigned"** flag when `preCompletedAt` is set.
- Detail: instructions, due date, the resource card, and current progress. The primary action opens the player or reader **inside the task context**, so returning lands back on the task.
- **There is no "mark task done" button for videos.** Status is derived server-side from resource progress; a button that only sometimes worked would be worse than none. For documents, the action is "Mark as read", which is the same control as §4 and is labelled identically.

### 5.7 Teacher Dashboard — `GET /home/teacher`

1. **My Classes** — assigned sections with student counts; tap → class detail.
2. **Active Tasks** — each with `completed / total` and a due date; tap → task report.
3. **Completion summary** — aggregate across active tasks.
4. **Continue Preparation** — the teacher's own in-progress TEACHER-audience resources.

### 5.8 Assign a resource (teacher)

Entered from a resource's overflow menu ("Assign…") or from Tasks → New. A three-step sheet:

1. **Resource** — pre-filled when entered from a resource; otherwise a scoped picker.
2. **Recipients** — a class from the teacher's **assigned sections only**, or selected students within one. A teacher with no section-bearing assignment sees "You aren't assigned to a class yet" and the flow is disabled — this matches the server, which refuses such a teacher outright.
3. **Details** — title, instructions, optional due date. Review shows the recipient count and how many have **already completed** the resource.

Error handling: `400` = teacher-audience resource picked (block it in the picker so this is unreachable in practice); `422` = some recipients cannot reach the resource — list them by name and let the teacher deselect and retry, do not silently drop them.

### 5.9 Manage tasks & reports (teacher)

- **Tasks list** — created by this teacher, filterable by class, subject, status.
- **Task detail** — editable title/instructions/due date only. The resource and recipients are immutable; the UI shows them as read-only with a "To change these, cancel and create a new task" note. Cancel is a confirm dialog and is soft.
- **Task progress** — Not started / In progress / Completed tabs of student rows, each with percentage and last activity. A **"Remind pending"** button; the server dedupes per day, so on a repeat the UI reports "Reminder already sent today" rather than pretending it sent another.
- **Individual student** — `GET /tasks/:id/students/:studentId`: video progress, document page/completion, and completion date.
- **Class progress** — `GET /teacher/class-progress`, filterable by class, subject or task.

Students outside the teacher's class scope return `404`. Do not build a school-wide student picker; the server will refuse it.

### 5.10 Notifications

- **Inbox** — `GET /me/notifications`, unread badge on the tab, pull to refresh, tap marks read (via the outbox) and deep-links to the task or resource.
- **Preferences** — in-app toggle, push toggle, task-reminder toggle, due-soon lead time, quiet hours. Maps 1:1 onto `PATCH /me/notification-preferences`.
- **Push** — register the FCM/APNs token via `POST /me/devices` after login and on token refresh; `DELETE /me/devices/:id` on logout, **before** clearing secure storage. If push permission is denied, the in-app inbox still works; present that plainly rather than nagging.
- Tapping a push while logged out routes to login, then to the deep link after a successful session.

---

## 6. Build order

Mirrors the backend phases so the client is never blocked on an unbuilt endpoint.

| Phase | Mobile deliverable | Needs backend phase |
| --- | --- | --- |
| **1** | Drift schema, outbox, sync worker, `PlaybackTracker`, resume + "Mark as read", History tabs | 1 |
| **2** | Student Home, Teacher Dashboard (without task tiles), Progress summary screens | 2 |
| **3** | Saved / Collections, search field + filter sheet | 3 |
| **4** | Student My Tasks, teacher Assign flow, Tasks list & detail | 4 |
| **5** | Task progress + individual student reports, notification inbox, preferences, push | 5 |

Phase 1 is load-bearing: build the outbox before any screen that writes, or every later feature grows its own ad-hoc retry.

---

## 7. Testing

- **Unit** — outbox coalescing (two video beats for one resource merge into one request); `4xx` discard vs `5xx` retry; `PlaybackTracker` emits no interval for a seek; `clientUpdatedAt` is stamped at action time.
- **Widget** — resume chooser appears only past the 10s divergence threshold; the task detail shows no "mark done" button for a video task; a teacher with no assigned class cannot open the Assign flow.
- **Integration** — airplane-mode watch → reconnect → progress lands; watch on device A, open on device B, position reflects A; log out and back in, history is restored from the server and not from a stale cache.
- **Manual, cross-device** — the sync matrix in backend plan §7, exercised across an Android device and the web client on the same account.

---

## 8. Open items

1. **Beat cost.** 4 calls/minute/viewer is fine at pilot scale, unverified at full rollout. If it bites, raise the interval to 30s and lean harder on the dispose flush — the union rule makes a coarser cadence safe, just lossier on a hard crash.
2. **`pageCount`** is unavailable until the backend adds it; the reader shows a bare page number until then.
3. **Offline search** is out of scope; decide whether a cached "recently viewed" search is worth it after usage data.
4. **Push provider** — the backend adapter supports FCM; iOS goes through FCM's APNs bridge rather than a second integration. Confirm before phase 5.
5. **Background beat delivery on iOS** is best-effort; a force-quit mid-video loses at most one interval window. Accepted, not solved.

## Addendum (2026-10-31): multi-class students and the class switcher

See `docs/2026-10-31-multi-class-enrollment-plan.md`. A student can be in several classes, possibly in different grades.

- `GET /users/me` returns `enrollment` (the **current** class) and `enrollments[]` (every ACTIVE class, current first, each with `isCurrent`). Show the switcher only when `enrollments.length > 1`.
- `PUT /users/me/current-enrollment` with `{ enrollmentId }` switches the class and returns the updated profile. The choice is stored on the server, so every device follows it.
- After a switch, **drop cached library, home, history, bookmarks and task lists** and refetch: they are all narrowed to the current class. Progress already queued in the sync engine is unaffected, because authorization covers every class.
- Notifications still arrive from every class. Opening a task or a video from another class works without switching.
