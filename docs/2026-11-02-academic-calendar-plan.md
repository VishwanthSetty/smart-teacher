# Academic Calendar — plan

**Date:** 2026-11-02 · **Status:** implemented (migration `20261102172830_add_academic_calendar`)

## 1. Requirement

A day-by-day plan of which lesson is taught when, for every **class (grade level) and subject**, per **academic year**.

1. The platform admin (SUPER_ADMIN) authors a **default calendar** per (grade, subject, year).
2. A school may author **its own calendar**, visible to that school only.
3. Each academic year has its own calendars.
4. Entries are **view-only text**. They do not link to lessons or videos yet.
5. The model must be **ready to link** entries to lessons (`ContentNode`) and videos later.
6. A school can **opt out** for a year. Viewers then see an empty calendar.

Decisions confirmed with the product owner:

| Question | Decision |
| --- | --- |
| What is a "class"? | **Grade level.** One calendar per (grade, subject, year). Every section of Grade 5 in a school shares it. |
| School calendar vs default | **Replaces the default** for that one (grade, subject, year) once the school's calendar is published. It can start as a copy of the default. Other subjects keep the default. |
| Which schools see a default? | **Only schools entitled** to a published curriculum for that (grade, subject). This matches how all platform content is gated. |
| Opt-out granularity | **Per school, per academic year**, set by SCHOOL_ADMIN. Nothing is deleted. Turning it back on restores the view. |

Decisions taken by default (cheap to revisit):

| Question | Default | Why |
| --- | --- | --- |
| Where do years come from? | A platform-global `AcademicYear` table (label + start/end date) managed by SUPER_ADMIN. | Defaults are per year and platform-wide, so the year has to be platform-wide too. `School.academicYear` stays as it is, a free-text label. |
| Can a school author a calendar for a pair it isn't entitled to? | **No.** The pairs a school can author are its entitled pairs. | It keeps one scope answer (`ActorContentScopeService`) for every calendar read and write. Future lesson/video links need the entitlement anyway. It is easy to relax later. |
| Draft vs published | Both default and school calendars have `DRAFT` / `PUBLISHED`. | An operator builds a year incrementally. Schools must not see a half-built default, and a school's half-built override must not blank the default it replaces. |
| Who edits a school calendar? | SCHOOL_ADMIN only. TEACHER and STUDENT read. | Mirrors sections and enrolment. |
| Multiple entries on one day? | Allowed (e.g. two periods of maths). Ordered by date, then creation. | |

## 2. Data model

Platform defaults and school calendars are **separate tables**, not one table with a nullable `schoolId`. Tenant scoping is automatic and keyed on a non-null `schoolId`. A nullable one would either hide every default from schools or need a bespoke bypass. This follows the `Curriculum` (global) / `SchoolContentEntitlement` (tenant) split.

```
AcademicYear (platform-global)          label "2026-2027", startDate, endDate (DATE)
 ├─ PlatformAcademicCalendar (global)   (year, grade, subject) unique, status
 │   └─ PlatformAcademicCalendarEntry   date, title, description
 ├─ SchoolAcademicCalendar (tenant)     (school, year, grade, subject) unique, status
 │   └─ SchoolAcademicCalendarEntry     schoolId, date, title, description
 └─ SchoolAcademicCalendarSetting (tenant)  (school, year) unique, isEnabled
```

- Dates are Postgres `DATE` columns, exchanged as `YYYY-MM-DD` strings. There is no time zone ambiguity.
- An entry's date must fall inside its year (`422` otherwise). Narrowing a year's dates is refused (`409`) while any entry would fall outside.
- `GradeLevel`, `Subject` and `AcademicYear` FKs are `Restrict`. Deleting a grade level or a year is refused (`409`) while calendars reference it. Deleting a school cascades.
- A missing `SchoolAcademicCalendarSetting` row means **enabled**. Opting out is the explicit act.
- The three tenant-scoped models join `TENANT_SCOPED_MODELS`. The three global ones join `PLATFORM_GLOBAL_MODELS`.

### Future-ready: linking entries to lessons and videos

Entries are first-class rows with stable ids, keyed on the same (grade, subject) spine as `Curriculum`. Linking is purely additive:

1. Add nullable `contentNodeId` (and/or `videoId`) FKs with `onDelete: SetNull` to both entry tables.
2. On write, validate that the node belongs to a curriculum of the calendar's grade and subject.
3. On read, filter linked items through `ActorContentScopeService`, as every content read already does. An unentitled link degrades to plain text.

No existing column or row changes shape, so no backfill is needed.

## 3. Resolution — what a viewer sees

`AcademicCalendarViewService.view(actor, query)`:

1. Resolve the year (`academicYearId`, or the year containing `from`, or today).
2. If the school opted out for that year: `{ isEnabled: false, entries: [] }`.
3. Visible pairs = the (grade, subject) of every curriculum in `ActorContentScopeService.resolveBrowse(actor)`. A STUDENT sees their current class's grade. A TEACHER is narrowed to taught pairs. A SCHOOL_ADMIN sees every entitled pair.
4. For each pair: the school's **PUBLISHED** calendar if one exists, otherwise the platform's **PUBLISHED** default, otherwise nothing.
5. Entries within `[from, to]`, sorted by date. Each entry carries `source: PLATFORM | SCHOOL`.

A school's DRAFT calendar never hides the default. Unpublishing a school calendar falls back to the default immediately.

## 4. API

| Route | Roles | Notes |
| --- | --- | --- |
| `GET /academic-years` | any | Picker list. |
| `POST/PATCH/DELETE /admin/academic-years[/:id]` | SUPER_ADMIN | `@BypassTenantScope()`: range and delete guards count school rows. |
| `GET/POST /admin/academic-calendars` | SUPER_ADMIN | Filter by year/grade/subject. `409` on duplicate or retired subject. |
| `GET/DELETE /admin/academic-calendars/:id` | SUPER_ADMIN | |
| `POST /admin/academic-calendars/:id/publish` · `/unpublish` | SUPER_ADMIN | |
| `POST /admin/academic-calendars/:id/entries` · `PATCH/DELETE …/entries/:entryId` | SUPER_ADMIN | |
| `GET /school-academic-calendars?academicYearId=` | SCHOOL_ADMIN | Overview: every entitled pair with its default/own calendar state and the effective source. |
| `POST /school-academic-calendars` | SCHOOL_ADMIN | `{ academicYearId, gradeLevelId, subjectId, copyFromDefault }`. `404` for an unentitled pair. |
| `GET/DELETE /school-academic-calendars/:id`, publish/unpublish, entries | SCHOOL_ADMIN | Delete = revert to the default. |
| `GET /academic-calendar-settings` · `PUT /academic-calendar-settings/:academicYearId` | SCHOOL_ADMIN | Opt in/out per year. |
| `GET …/:id/entries/import-template` (both roots) | SUPER_ADMIN / SCHOOL_ADMIN | `.xlsx` template whose example row sits in the calendar's year. |
| `POST …/:id/entries/import` (both roots) | SUPER_ADMIN / SCHOOL_ADMIN | Multipart `file` + `dryRun` + `replaceExisting`. See §4a. |
| `GET /academic-calendar` | SCHOOL_ADMIN, TEACHER, STUDENT | `academicYearId?`, `from?`, `to?`, `gradeLevelId?`, `subjectId?`. Range ≤ 400 days. |
| `GET /academic-calendar/subjects` | SCHOOL_ADMIN, TEACHER, STUDENT | The pairs the actor may pick from. |

Cross-tenant and unentitled misses are `404`. All routes are in `rbac-matrix.e2e-spec.ts`.

## 4a. Excel upload

Requested after the first cut. One upload per calendar, with columns **Date, Lesson, Notes**. `.xlsx` and `.csv` are both accepted.

| Decision | Why |
| --- | --- |
| New dependency **`exceljs`** (API only) | The existing imports are CSV-only. SheetJS's npm build is frozen at an old version with advisories. Its one audit path (`archiver` → `glob`) is the directory-zipping code, which in-memory workbooks never reach. |
| **Stateless dry run**, no staging table | Teacher/student imports stage a batch because each row needs lookups against other tables. A calendar row only needs a date inside the year and a title, so the client sends the same file twice: `dryRun=true` previews, then the commit. |
| **All-or-nothing commit** (`422` if any row is invalid) | A half-imported year is harder to repair than a fixed sheet. The preview has already listed every bad row with its spreadsheet row number. |
| Appending **skips exact duplicates** (same date + lesson) | Re-uploading a sheet after adding a few rows must not double every lesson. `replaceExisting` deletes and re-creates in one transaction. |
| Dates: Excel date cells, `YYYY-MM-DD` or **day-first** `DD/MM/YYYY` | Day-first is the schools' convention. Impossible dates (31/02) are rejected rather than rolled over. |

Limits: 5 MB, 2,000 rows, only the first sheet is read. Columns are matched by heading (`date`; `lesson`/`title`/`topic`; `notes`/`description`), in any order or case.

## 5. Web

| Page | Role | |
| --- | --- | --- |
| `/dashboard/academic-calendar` | SUPER_ADMIN | Years (create/edit/delete) and default calendars (create, publish, delete). |
| `/dashboard/academic-calendar/[id]` | SUPER_ADMIN, SCHOOL_ADMIN | Calendar editor: entries grouped by month, add/edit/delete, publish. The same component serves default and school calendars. |
| `/dashboard/academic-calendar` | SCHOOL_ADMIN | Year picker, opt-in toggle, and an overview table of entitled pairs. Create own (blank / copy of default), revert. |
| `/dashboard/academic-calendar` | TEACHER, STUDENT | Month grid of the effective calendar, filterable by class and subject. Empty grid when opted out. |

## 6. Tests

- Unit (Prisma mocked): view resolution (opt-out, school override only when PUBLISHED, DRAFT default hidden, scope pairs), entry date range, copy-from-default, year narrowing guard.
- E2e `academic-calendar.e2e-spec.ts`: default visible to the entitled demo-school and not to demo-school-b; a school override replaces the default; demo-school-b cannot read or edit demo-school's calendar (`404`); opt-out empties the view; a student sees only their grade.

## 7. Out of scope (follow-ups)

copying a whole year forward · holidays/events as a typed entry kind · section-level overrides · linking entries to lessons/videos (§2) · mobile screens.
