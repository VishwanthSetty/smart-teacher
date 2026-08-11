# Flutter mobile app — Teacher & Student feature list

**Date:** 2026-08-10
**Status:** Reference document — for mobile scoping, not a backend change plan
**Scope:** New `apps/mobile` (Flutter), consuming `apps/api` directly. TEACHER and STUDENT roles only — no SCHOOL_ADMIN or SUPER_ADMIN screens.
**Explicitly out of scope for now:** the video player and document (PDF) viewer/reader UI. Their list/detail/browse screens are in scope; the actual playback/reader surface is not — the app should stop at "here's the entitled item" and stub the player.

---

## 0. How this differs from the web app — read first

The web app (`apps/web`) is a **BFF**: the browser never holds a JWT, `apps/web/src/app/api/*` route handlers do, in httpOnly cookies. Flutter has no browser and no BFF tier of its own, so **the mobile app talks to `apps/api` directly** (`http://<api-host>:4000` in dev; whatever `API_URL` resolves to in prod). This is the one architectural pattern the app *cannot* mirror from `apps/web` — everything else (roles, entitlements, error shapes) is shared.

Consequences for the Flutter build:

1. **The app itself becomes the token holder.** Store `accessToken` + `refreshToken` in secure, encrypted device storage (`flutter_secure_storage`), never `SharedPreferences` in plaintext.
2. **The app must implement its own refresh flow**, mirroring `middleware.ts`'s job: attach `Authorization: Bearer <accessToken>` to every call; on a `401`, call `POST /auth/refresh` with the refresh token, store the rotated pair, and retry once. A single HTTP client interceptor (Dio) is the natural place for this — see §7.
3. **CORS is irrelevant** — it's a browser-only mechanism, so `CORS_ORIGIN` doesn't need to know about the app. Nothing to configure server-side for mobile specifically.
4. **`schoolSlug` matters at login.** Email is unique *per school*, not globally (`LoginDto`). The login screen needs a school-slug field (or a school picker resolved some other way) alongside email/password — mirror `apps/web`'s login form. SUPER_ADMIN's slug-less login path is not relevant here since mobile is teacher/student only.
5. **Every list/detail read is already entitlement-scoped server-side** (see §1) — the app never filters "is my school entitled to this" client-side; it just renders what the API returns.

---

## 1. Entitlements — how role + school already gate everything

This is enforced **entirely server-side**; the app doesn't reimplement it, but every screen's behavior depends on it, so know the rule:

`ActorContentScopeService.resolve()` is the one place that answers "which curricula can this actor see," and every content read (`/curricula`, `/videos`, `/documents`) goes through it:

- **STUDENT** — narrowed to their **active enrollment's grade level**, intersected with the school's entitlements, and only `STUDENT`-audience curricula. **No active enrollment → empty library**, not the whole school's content. This is a real, current gap for mobile: see §6.
- **TEACHER** — if the teacher has at least one grade-bearing `TeacherAssignment`, they see `TEACHER`-audience curricula plus any `STUDENT`-audience curriculum matching a `(gradeLevel, subject)` pair they teach. A teacher with **no** assignments yet falls back to the school's full entitlement set (so onboarding doesn't blank them out).
- A school with **zero entitlements** → both roles see an empty library. This is expected, not a bug — render a proper empty state, not an error.

A single-item read (`GET /videos/:id`, `GET /curricula/:id/tree`) can never be wider than the list — a 404 there means "doesn't exist *or* your school/role isn't entitled," and the app must not distinguish those (that's deliberate — see CLAUDE.md, 404-not-403 for ownership).

---

## 2. Shared features (both TEACHER and STUDENT)

### 2.1 Login
- **Screen:** email + password + school slug, "forgot password" link.
- **API:** `POST /auth/login` `{ email, password, schoolSlug }` → `{ accessToken, refreshToken }` (also sets `Set-Cookie` for web, irrelevant to mobile — read the JSON body).
- Failure states to design for: `401` invalid credentials (generic message, don't reveal which field), `403` account disabled / school suspended, `429` locked out (20 failed attempts / 50 min) — show a "try again later" state, not a raw error.

### 2.2 Session refresh (silent, no dedicated screen)
- **API:** `POST /auth/refresh`, bearer = refresh token → new `{ accessToken, refreshToken }`, old refresh token revoked.
- Drive this from the Dio interceptor (§7), not from a UI event. On refresh failure (revoked/reused/expired) → force logout, route to login.

### 2.3 Logout
- **API:** `POST /auth/logout` `{ refreshToken? }` → `204`. Omit `refreshToken` to kill *all* sessions for the user (a "log out everywhere" option is a nice extra, not required for v1); include it to kill only this device.
- Clear secure storage regardless of the response — don't block logout UI on the network call succeeding.

### 2.4 Forgot / reset password
- **Screen 1 — request:** email + school slug → `POST /auth/forgot-password` `{ email, schoolSlug }` → always `200` with a generic message (never reveal whether the account exists). Rate-limited (`429`) separately from login lockout.
- **Screen 2 — reset:** token (from the emailed link — see §6 for the deep-link gap) + new password → `POST /auth/reset-password` `{ token, password }` → `204`. On success, all of that user's sessions are revoked server-side, so route straight to login, not back into the app.

### 2.5 First-login / set password (account activation)
- Only relevant if a school admin still uses the invite-email flow rather than handing out a password directly (see CLAUDE.md's `passwords` module) — check current admin practice before building. If needed: token (from emailed link) + new password → `POST /auth/set-password` `{ token, password }` → `204`.

### 2.6 Profile ("Me")
- **Screen:** name, email, role badge, school name.
- **API:** `GET /users/me` → `MeEntity`:
  ```json
  {
    "id": "...", "email": "...", "name": "...",
    "role": "TEACHER | STUDENT",
    "schoolId": "...",
    "school": { "id": "...", "name": "...", "slug": "...", "status": "ACTIVE | SUSPENDED" }
  }
  ```
- If `school.status === 'SUSPENDED'`, the API already 403s on every subsequent call within the access-token lifetime — surface a "your school's access is suspended, contact your admin" state rather than a generic error when you see that 403 pattern repeatedly.
- `GET /users/:id` also exists (self or, for admins, others) but `/users/me` is the one the app needs.

### 2.7 Taxonomy lookups (supporting data, not a screen)
- **APIs:** `GET /subjects`, `GET /grade-levels` — flat catalog lists, available to every role. Useful for labels/filters if you build any client-side filtering UI on top of the curricula tree; the entitlement scoping itself is already done server-side, these are just name lookups.

---

## 3. Curricula & content browsing (shared shape, scoped differently per role — see §1)

Both roles browse the same two endpoints; STUDENT and TEACHER simply see different (server-computed) subsets.

### 3.1 Curriculum list
- **Screen:** "My Library" — list of curricula (grade × subject), each showing counts.
- **API:** `GET /curricula` (optional `?audience=STUDENT|TEACHER` query to filter by intended audience) → `CurriculumEntity[]`:
  ```json
  {
    "audience": "STUDENT",
    "id": "...", "gradeLevelId": "...", "gradeLevelName": "Grade 5",
    "subjectId": "...", "subjectName": "Mathematics",
    "schemaId": "...", "schemaName": "...",
    "status": "PUBLISHED",
    "publishedAt": "2026-01-01T00:00:00Z",
    "nodeCount": 12, "videoCount": 8, "documentCount": 3
  }
  ```

### 3.2 Curriculum tree (chapters/topics inside one curriculum)
- **Screen:** drill-down tree/list view — chapters → sub-topics → videos/documents at each level.
- **API:** `GET /curricula/:id/tree` → `ContentTreeEntity`, a recursive `nodes[]` tree; each node carries its own `videos[]` and `documents[]` plus `videoCountDeep`/`documentCountDeep` (so you can grey out or collapse an empty branch without walking the subtree client-side).
- Tapping a video/document row here is the handoff point to the (currently out-of-scope) player/reader — just navigate to a stub screen with the id for now.
- `404` here means "doesn't exist, unentitled, or unpublished" — same non-distinguishing 404 as everywhere else.

### 3.3 Flat video / document lists (alternative to the tree, e.g. for search/recents)
- **APIs:**
  - `GET /videos` → `VideoEntity[]`, `GET /videos/:id` → single.
  - `GET /documents` → `DocumentEntity[]`, `GET /documents/:id` → single.
  - Both entities carry `contentNodeId`/`contentNodeTitle`/`curriculumId`/`gradeLevelId`/`subjectId` denormalized on — enough to label a flat row without a second round-trip to the tree.
- **Document download** (metadata only, not a reader): `GET /documents/:id/download` → `{ url, expiresInSecs, fileName }` — a short-lived signed URL. Since the reader is out of scope, this is only needed if you want a "share/open externally" action; otherwise skip for v1.
- **Video playback token** — out of scope per your instruction, but noted for completeness: `GET /videos/:id/playback-token` mints a 10-minute-lived signed manifest URL. Nothing to build here now.

---

## 4. TEACHER-only features

### 4.1 My assignments (what I teach)
- **Screen:** "My Classes" — list of `(subject, section/grade)` pairs the teacher is assigned to.
- **API:** `GET /teacher-assignments?teacherId={me.id}` → `TeacherAssignmentEntity[]`.
  - **Important:** this endpoint is *not* auto-scoped to "my own" — a bare `GET /teacher-assignments` returns every assignment in the school. The mobile client must always pass `teacherId=<own user id>` (from `/users/me`). Also supports `sectionId`, `subjectId`, `gradeLevelId` filters if useful for a "browse by class" view.
  - Response shape:
    ```json
    {
      "id": "...", "teacherId": "...", "teacherName": "...", "teacherEmail": "...",
      "subjectId": "...", "subjectName": "Mathematics", "subjectCode": "MATH",
      "sectionId": "...", "sectionName": "A",
      "gradeLevelId": "...", "gradeLevelName": "Grade 5",
      "sectionLabel": "Grade 5 - A",
      "createdAt": "..."
    }
    ```
  - `sectionId`/`sectionName`/`gradeLevelId`/`gradeLevelName`/`sectionLabel` are all `null` together for a school-wide "teaches this subject" grant predating sections (from bulk CSV import) — design the row UI to handle that (e.g. "Mathematics — all sections" vs. "Mathematics — Grade 5 - A").

### 4.2 My students (roster, read-only)
- **Screen:** student roster, filterable/searchable, likely scoped to a section the teacher taught (client-side filter using `sectionId` from §4.1, since the API itself doesn't auto-narrow by teacher).
- **API:** `GET /students?page=&limit=&search=&sectionId=&status=` → `PaginatedStudentsEntity` (paginated, default `limit=20`, max `100`). Each `StudentEntity`:
  ```json
  {
    "id": "...", "email": "...", "firstName": "...", "lastName": "...", "name": "...",
    "status": "ACTIVE | PENDING | DISABLED",
    "activatedAt": "...", "createdAt": "...",
    "enrollment": { "id": "...", "sectionId": "...", "sectionName": "A", "gradeLevelId": "...", "gradeLevelName": "Grade 5", "rollNumber": "..." }
  }
  ```
  `enrollment` is `null` for an unplaced student.
- No write access — TEACHER cannot create/edit/deactivate students or reset passwords (`PATCH /students/:id`, password routes are SCHOOL_ADMIN-only). Roster screen is view-only.

### 4.3 Sections (supporting lookup)
- **API:** `GET /sections` → `SectionEntity[]` — needed to populate a "filter by section" picker on the roster screen, since `/students` takes `sectionId` as an opaque filter, not a joined list.

### 4.4 Not available to TEACHER (confirm before designing toward them)
- No `/admin/*` routes, no `/admin/stats`, no bulk-import UI (that's `SCHOOL_ADMIN`-only, web-only for now). Don't build attendance, gradebook, or timetable screens — none of those exist in the backend yet (per CLAUDE.md: "Timetables do not [exist]"). If any of these are on your roadmap, they need a backend feature first — this doc only covers what `apps/api` already exposes.

---

## 5. STUDENT-only features

Students get a strict subset of §3 with no additional endpoints of their own — there is currently **no student-specific API** beyond the shared browsing surface. Concretely, a STUDENT mobile app is:

- Login → Profile (`/users/me`) → Curricula list (`/curricula`, narrowed to their enrolled grade) → Curriculum tree (`/curricula/:id/tree`) → video/document rows (stubbed, player out of scope).
- **No self-service roster/enrollment view exists** — see the gap in §6.1; a student today cannot see their own section/grade/roll-number via any API. If the profile screen should show "Grade 5 - A, Roll No. 14," that needs a small backend addition first.
- No write actions anywhere for STUDENT in the current API surface (no submissions, no progress tracking, no quizzes — none of that exists in `apps/api` today).

---

## 6. Backend gaps to close before / alongside mobile work

These aren't blockers for starting the Flutter build, but flag them now so they don't surprise you mid-build:

1. **No student self-enrollment endpoint.** `GET /students` (roster) is `SCHOOL_ADMIN`/`TEACHER`-only; `GET /users/me` doesn't include grade/section/roll-number. A STUDENT app has no way to display "which grade/section am I in" today, even though the *content* they see is already correctly scoped to it server-side. Likely fix: add an `enrollment` field to `MeEntity` for STUDENT actors (small, additive change — mirrors `StudentEntity.enrollment`).
2. **Password-reset and invite links are email deep-links.** Decide the mobile deep-link scheme (`smartteacher://reset-password?token=...`) and register it with whatever mail templates currently point at the web app, or accept that reset/activation happens in a mobile browser tab that then hands back to the app. Not an API change, but a coordination item with `apps/api/src/mail`.
3. **`GET /teacher-assignments` has no "mine" shortcut** — every call must pass `teacherId`. Fine as-is, just don't forget it (§4.1); a convenience `GET /teacher-assignments/mine` would be a nice-to-have, not required.
4. **Push notifications, offline caching, attendance, gradebook, quizzes, timetables** — none exist in `apps/api`. If the mobile roadmap includes any of these, they're new backend features, not just a mobile client to build against.

---

## 7. Flutter-side implementation checklist

Not prescribing a full architecture, but the pieces this feature set requires:

- **HTTP client:** Dio (or equivalent) with one interceptor that (a) attaches `Authorization: Bearer <accessToken>`, (b) on `401`, pauses in-flight requests, calls `POST /auth/refresh` once, persists the rotated pair, and retries — mirroring `middleware.ts`'s job, client-side.
- **Secure token storage:** `flutter_secure_storage` (Keychain/Keystore-backed) for `accessToken` + `refreshToken`. Never log them.
- **Auth state:** a simple session notifier (Riverpod/Bloc/whatever the team already uses elsewhere) gating a router redirect to `/login` when there's no valid session — same shape as `middleware.ts`'s gate on `/dashboard/*`.
- **Error mapping:** the API's `ApiErrorResponse` shape (from `HttpExceptionFilter`) is consistent across every endpoint — build one error-parsing helper, not per-screen try/catch duplication. Map `401`→forced logout, `403`→role/entitlement/suspension message, `404`→"not found" (never imply "you're not allowed," per the backend's own 404-not-403 policy), `429`→rate-limit message with retry hint.
- **Empty states:** an unentitled school and an unplaced student are both legitimate zero-content states (§1) — design them as first-class empty states, not errors.
- **Role-based navigation:** two home shells (Teacher tab bar: My Classes / Roster / Library; Student tab bar: Library / Profile) driven off `MeEntity.role` after login — don't hardcode a role assumption anywhere else.
- **Pagination:** only `/students` is paginated today (`page`/`limit`, max `100`) — build one reusable paginated-list widget for that; everything else (`/curricula`, `/videos`, `/documents`, `/teacher-assignments`, `/sections`) returns a flat array, no paging.

---

## 8. Quick API reference (TEACHER / STUDENT reachable only)

| Method & path | Roles | Purpose |
| --- | --- | --- |
| `POST /auth/login` | public | Login, needs `schoolSlug` |
| `POST /auth/refresh` | public (refresh token) | Rotate tokens |
| `POST /auth/logout` | any | Revoke session(s) |
| `POST /auth/forgot-password` | public | Request reset email |
| `POST /auth/reset-password` | public | Consume reset token |
| `POST /auth/set-password` | public | Consume invite/activation token |
| `GET /users/me` | any | Profile + school |
| `GET /users/:id` | any (self, or admin for others) | Single user lookup |
| `GET /subjects` | any | Subject catalog |
| `GET /grade-levels` | any | Grade level catalog |
| `GET /curricula` | SCHOOL_ADMIN, TEACHER, STUDENT | Entitled curricula list |
| `GET /curricula/:id/tree` | SCHOOL_ADMIN, TEACHER, STUDENT | Chapters/topics + content |
| `GET /videos` | SCHOOL_ADMIN, TEACHER, STUDENT | Flat entitled video list |
| `GET /videos/:id` | SCHOOL_ADMIN, TEACHER, STUDENT | Single video |
| `GET /documents` | SCHOOL_ADMIN, TEACHER, STUDENT | Flat entitled document list |
| `GET /documents/:id` | SCHOOL_ADMIN, TEACHER, STUDENT | Single document |
| `GET /documents/:id/download` | SCHOOL_ADMIN, TEACHER, STUDENT | Signed download URL (optional, out-of-scope reader) |
| `GET /teacher-assignments?teacherId=` | SCHOOL_ADMIN, TEACHER | Teacher's own taught classes |
| `GET /sections` | SCHOOL_ADMIN, TEACHER | Section lookup for filters |
| `GET /students?...` | SCHOOL_ADMIN, TEACHER | Paginated roster, read-only for TEACHER |

*(Deliberately excluded: everything under `/admin/*`, `/teachers/*` write routes, `/students` writes, video playback-token/HLS/poster routes, and anything SUPER_ADMIN/SCHOOL_ADMIN-only — none of it is reachable by a TEACHER or STUDENT token, so it's not listed even for reference.)*
