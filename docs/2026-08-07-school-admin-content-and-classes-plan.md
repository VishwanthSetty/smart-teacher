School Admin: video library + real Classes & Sections page
Context
A SCHOOL_ADMIN today is blind to two things their school owns.

Videos. VideosController and CurriculaController are both @Roles(Role.TEACHER, Role.STUDENT), and GET /videos/:id/playback-token is @Roles(SUPER_ADMIN, TEACHER, STUDENT). A school admin gets a 403 on every school-facing content route, so they cannot see — let alone check — the lessons their school is licensed for. This was a deliberate F-06 acceptance criterion ("School Admins receive 403 on all video-content endpoints"), asserted in code comments, in videos.e2e-spec.ts, in content-tree.e2e-spec.ts, and in a table-wide assertion in rbac-matrix.e2e-spec.ts. This change deliberately reverses that criterion for the read/watch surface only. Authoring (/admin/videos, /admin/curricula, /admin/grade-levels, /admin/subjects) and cross-tenant entitlement management stay SUPER_ADMIN-only, unchanged.

Classes. /dashboard/classes renders <ComingSoon>, yet Section, Enrollment and TeacherAssignment are fully implemented models with migrations, services, RBAC rows and e2e coverage. GET /sections already allows SCHOOL_ADMIN + TEACHER. The stub is simply stale UI over a working backend.

Outcome: a school admin can browse and watch every video their school is entitled to, and can see every class/section with its grade level, student count and assigned teachers.

No scoping logic changes. ActorContentScopeService.resolve() already returns the school's full entitled-and-PUBLISHED curriculum set for any non-SUPER_ADMIN, non-STUDENT actor — SCHOOL_ADMIN falls through the same branch TEACHER does today. The tenant guard supplies the schoolId. The only blockers are the @Roles decorators.

Part 1 — API: open the school-facing content surface to SCHOOL_ADMIN
Three decorator edits. Each header comment currently asserts the 403 criterion and must be rewritten, not just amended.

File	Change
apps/api/src/videos/videos.controller.ts:21	@Roles(Role.SCHOOL_ADMIN, Role.TEACHER, Role.STUDENT); rewrite the F-06 comment (lines 10–17) to say browsing/watching entitled content is now a SCHOOL_ADMIN capability too, and that SUPER_ADMIN is still excluded because /admin/videos is their surface.
apps/api/src/curriculum/curricula.controller.ts:22	Same role set, same comment rewrite (lines 11–18).
apps/api/src/playback/playback.controller.ts:19	@Roles(Role.SUPER_ADMIN, Role.SCHOOL_ADMIN, Role.TEACHER, Role.STUDENT).
No @BypassTenantScope() on any of them — SCHOOL_ADMIN carries a real schoolId, exactly like TEACHER, and the tenant guard scoping SchoolContentEntitlement is what makes the read safe.

Add one clarifying line to the class comment in apps/api/src/entitlements/actor-content-scope.service.ts recording that SCHOOL_ADMIN and TEACHER share the fall-through branch (the school's full entitlement set) — the fall-through is currently implicit and now carries a second caller. No code change in this file.

Optional but included: make the dashboard "Classes" tile honest
apps/api/src/stats/stats.service.ts hard-returns classes: null with a comment saying the Class model doesn't exist. It does — it's Section. Add countAll(): Promise<number> to apps/api/src/students/sections.service.ts (prisma.section.count(), tenant guard scopes it), export SectionsService from students.module.ts alongside EnrollmentsService, inject it into StatsService (which is explicitly designed as an aggregator for exactly this), and return the real count. Leave latestTimetable: null — timetables genuinely do not exist. Keep DashboardStats.classes typed number | null; only the value changes.

Part 2 — API tests (the build fails without these)
apps/api/test/rbac-matrix.e2e-spec.ts
Update four MATRIX rows to the new role sets: GET /curricula, GET /curricula/:id/tree (L369–378), GET /videos, GET /videos/:id, GET /videos/:id/playback-token (L546–560). The decorator-match test asserts MATRIX.allow equals the actual @Roles set, so these must move in the same commit.
Narrow CONTENT_AND_ENTITLEMENT_PATHS (L569–575). It currently contains '/videos', and the filter is pathOf(key).includes(path) — which matches GET /videos, GET /videos/:id and the playback-token row. Drop '/videos'; keep '/admin/videos', '/admin/grade-levels', '/admin/subjects', '/entitlements'. Rename the constant to something like CONTENT_AUTHORING_AND_ENTITLEMENT_PATHS and rewrite the test name at L650 to "denies SCHOOL_ADMIN every content-authoring and entitlement endpoint".
Re-count the expect(contentRows.length).toBeGreaterThanOrEqual(15) floor at L656 after the narrowing (it is a vacuity guard — run the suite and set it to the new actual count).
apps/api/test/videos.e2e-spec.ts
Remove ['/videos'] from the SCHOOL_ADMIN 403 table (L246–253); the remaining /admin/* rows stay.
Rewrite the describe('role boundaries') comment at L243.
Add positives, using the existing seedContentFixtures() asymmetry (demo-school holds exactly one entitlement, demo-school-b holds none): SCHOOL_ADMIN on demo-school gets 200 from GET /videos with the entitled video present and the unentitled one absent; admin-b@ gets 200 with []; SCHOOL_ADMIN gets 404 (not 403) on GET /videos/:id for an unentitled video.
apps/api/test/content-tree.e2e-spec.ts
Change the it.each([[SCHOOL_ADMIN], [SUPER_ADMIN]])('403s a %s') at L91 to SUPER_ADMIN only, with the comment updated.
Add: SCHOOL_ADMIN gets 200 from GET /curricula listing only the school's entitled curriculum, and 200 from GET /curricula/:id/tree for it.
apps/api/test/playback.e2e-spec.ts
Add: a SCHOOL_ADMIN on demo-school mints a token for the entitled video; admin-b@ gets 404 for the same video.
Unit specs
apps/api/src/entitlements/actor-content-scope.service.spec.ts — add a SCHOOL_ADMIN case asserting the school's full entitlement set, mirroring the existing TEACHER case.
apps/api/src/videos/videos-access.policy.spec.ts — add a SCHOOL_ADMIN case if the existing table enumerates roles.
If Part 1's optional stats change lands: update apps/api/src/stats/stats.service.spec.ts (if present) and apps/api/test/stats.e2e-spec.ts, which currently asserts classes: null.
Part 3 — Web: show the video library to school admins
apps/web/src/lib/nav.ts
The My Subjects item (L91–95) points at STUDENT_HOME = '/dashboard/videos' and is TEACHER + STUDENT. Add Role.SCHOOL_ADMIN. "My Subjects" is wrong wording for an admin, and duplicating the href would break canRoleAccess, which does NAV_ITEMS.find(candidate => candidate.href === href) and returns the first match.

Add an optional per-role label override to NavItem and resolve it in navItemsForRole:

export interface NavItem {
  label: string;
  // Some routes read differently per role — a student's "My Subjects" is an admin's
  // "Video Library". One entry per href is what keeps canRoleAccess a single lookup.
  labelByRole?: Partial<Record<Role, string>>;
  href: string;
  icon: LucideIcon;
  roles: readonly Role[];
}

export function navItemsForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role)).map((item) =>
    item.labelByRole?.[role] ? { ...item, label: item.labelByRole[role] as string } : item,
  );
}
Then: { label: 'My Subjects', labelByRole: { [Role.SCHOOL_ADMIN]: 'Video Library', [Role.TEACHER]: 'Video Library' }, href: STUDENT_HOME, icon: Video, roles: [SCHOOL_ADMIN, TEACHER, STUDENT] }. canRoleAccess is untouched — it reads roles, not label.

apps/web/src/app/dashboard/videos/page.tsx
canRoleAccess now admits SCHOOL_ADMIN, so the page works unchanged. Only adjust the non-student description (L27–29) to something admin-accurate, e.g. Every lesson your school is licensed for. The isStudent branch and [curriculumId] / [curriculumId]/[videoId] pages need no changes — both gate on canRoleAccess(user.role, '/dashboard/videos') and the BFF at apps/web/src/app/api/videos/[id]/playback-token/route.ts forwards the cookie token verbatim.

Add apps/web/src/app/dashboard/videos/loading.tsx — every other dashboard route has one and this route does not.

Part 4 — Web: real Classes & Sections page
Replace the <ComingSoon> stub at apps/web/src/app/dashboard/classes/page.tsx with a server component, mirroring the shape of apps/web/src/app/dashboard/students/page.tsx.

No new API endpoints. Everything comes from existing api-client.ts helpers:

const [sections, assignments, gradeLevels] = await Promise.all([
  apiListSections(accessToken),                                  // GET /sections — SCHOOL_ADMIN + TEACHER
  apiListTeacherAssignments(accessToken, {}),                    // GET /teacher-assignments — SCHOOL_ADMIN + TEACHER
  isAdmin ? apiListGradeLevels(accessToken) : Promise.resolve([]), // @AnyRole, feeds the create form only
]);
Keep the existing gate: requireUser() then if (!canRoleAccess(user.role, '/dashboard/classes')) redirect('/dashboard'), and const isAdmin = user.role === Role.SCHOOL_ADMIN.

Render a table over sections (already ordered by grade rank then name by SectionsService.findAll):

Column	Source
Class	section.label ("Grade 5 - A")
Grade level	section.gradeLevelName
Students	section.studentCount (ACTIVE enrolments only), linking to /dashboard/students?sectionId=${section.id} — that filter already works
Teachers	assignments.filter(a => a.sectionId === section.id) rendered as subjectName — teacherName chips; — when empty
Below the table, list the school-wide assignments (a.sectionId === null, the shape the teacher CSV import produces) under a short heading so they are not silently invisible. Use <EmptyState> from components/ui/empty-state.tsx when sections.length === 0.

Move the create-section form to where it belongs. apps/web/src/app/dashboard/students/_components/create-section-form.tsx is currently rendered on the Students page. Per the repo's "promote to components/ on second use" convention, promote it to apps/web/src/components/sections/create-section-form.tsx (no code change — it already POSTs to the existing /api/sections BFF route and calls router.refresh()), render it on the Classes page behind isAdmin, and remove it from the Students page. Assumption: one home for class creation is better than two; the Students page keeps its section <select> filter and its apiListSections call, and only drops the apiListGradeLevels call and the form. Say so if you'd rather it stay on both.

Update apps/web/src/app/dashboard/classes/loading.tsx to a table skeleton (it exists but was written for the stub).

Part 5 — Documentation
CLAUDE.md:7 and AGENTS.md:5 both claim "Classes, enrollments and timetables do not [exist]". Classes and enrollments do — correct both to name only timetables.
Both files' "Platform content" section states the TEACHER/STUDENT-only content rule; update to include SCHOOL_ADMIN on the read/watch surface while keeping "authoring is SUPER_ADMIN-only" explicit.
docs/curriculum-tree-plan.md:259 restates the old 403 criterion — add a one-line note that it was superseded.
Write this plan to docs/2026-08-07-school-admin-content-and-classes-plan.md.
Explicitly out of scope
Entitlement visibility for school admins (/entitlements stays SUPER_ADMIN-only) — you chose browse + watch only.
GET /sections/:id, PATCH, DELETE, section pagination/filters, and a /dashboard/classes/[id] roster drill-down.
TEACHER content narrowing by TeacherAssignment.sectionId — still the documented deferred item in actor-content-scope.service.ts:20.
Timetables.
The two pre-existing bugs found while exploring, unrelated to this work: video-row-actions.tsx:95 POSTs to a non-existent /api/videos/:id/retranscode (the component is currently unimported dead code), and apiListAdminVideos silently drops the curriculumId/contentNodeId filters the API accepts.
Verification
npm run lint — no new warnings.
npm run build — all workspaces.
npm run test:e2e — the RBAC matrix is the gate. Expect failures until Part 2 is complete: the symmetric-diff/decorator-match tests fail on any un-updated MATRIX row, and the acceptance-criteria test fails until CONTENT_AND_ENTITLEMENT_PATHS is narrowed.
Targeted: from apps/api, npx jest --config ./test/jest-e2e.json -t "video", -t "curricula", -t "playback", -t "RBAC".
Manual, against npm run dev with a seeded environment (npm run db:migrate && npm run db:seed, then create a school, grant it an entitlement as super admin, and add a section + student):
Log in as the school admin → sidebar shows Video Library and Classes & Sections.
Video Library lists only the entitled curricula; drilling into a curriculum shows the tree; opening a video plays it through HlsPlayer.
Log in as an admin of a school with no entitlements → Video Library shows the "No curricula yet" empty state, not another tenant's content.
Classes & Sections lists each section with the right grade level, student count and teachers; the student count links through to a filtered Students list; creating a section from this page succeeds and the row appears.
Dashboard "Classes" tile shows the section count instead of "—" (if Part 1's optional item landed).
Log in as a TEACHER → unchanged behaviour, nav still reads Video Library.
Log in as a STUDENT → nav still reads My Subjects, still lands on /dashboard/videos, still sees only their grade level's curricula.

