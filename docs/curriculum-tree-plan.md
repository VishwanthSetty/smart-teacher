# Configurable Content Hierarchy — Implementation Plan

**Status:** planned, not started. **Migration posture:** development database is disposable; no backfill, no data preservation. `prisma migrate reset --force` then a fresh migration.

## Goal

Replace the flat `(gradeLevel, subject)` content key with a configurable tree of arbitrary depth, where the depth and the level names vary per grade and per subject. A student sees exactly the structure an operator authored.

## Decisions taken

| Decision | Choice |
| --- | --- |
| Spine | Grade and subject stay first-class tables (levels 1–2). Everything below is a configurable tree. |
| Authoring | Platform only. `SUPER_ADMIN` authors; schools consume read-only. The tree stays platform-global with no tenant column. |
| Licensing unit | Whole curriculum. Entitlement is `(schoolId, curriculumId)`. |
| Publishing | `DRAFT → PUBLISHED`; edits to a published curriculum apply live. No versioned revisions. |

## Shape

```
GradeLevel ──┐
             ├──> Curriculum ──> ContentNode tree (depth governed by CurriculumSchema)
Subject ─────┘        │                    └── Video attaches to a content-holding node
                      │
              SchoolContentEntitlement (schoolId, curriculumId)   ← the only tenant-scoped row here
```

`Curriculum` is one row per `(gradeLevel, subject)` and is three things at once: the licensing unit, the tree root, and where the level configuration is bound. That is what keeps the blast radius small — every existing safety property is expressed in terms of "which curricula may this actor reach", which is a strictly simpler question than the pair it replaces.

---

# 1. Prisma schema

`apps/api/prisma/schema.prisma`

### New enum

```prisma
enum CurriculumStatus {
  DRAFT
  PUBLISHED
  ARCHIVED
}
```

### New models

```prisma
// A reusable, ordered level vocabulary — "Chapter -> Topic -> Sub-topic". Platform-global.
// Reused across many curricula so "depth varies per grade and per subject" does not turn
// into one config blob per curriculum.
model CurriculumSchema {
  id          String            @id @default(cuid())
  name        String
  code        String            @unique
  description String?
  levels      CurriculumLevel[]
  curricula   Curriculum[]
  createdAt   DateTime          @default(now())
  updatedAt   DateTime          @updatedAt
}

// One level in that vocabulary. `depth` is 1-based and counted BELOW the grade/subject
// spine, so depth 1 is the first authored level (typically "Chapter").
model CurriculumLevel {
  id             String           @id @default(cuid())
  schemaId       String
  schema         CurriculumSchema @relation(fields: [schemaId], references: [id], onDelete: Cascade)
  depth          Int
  name           String
  // Only a level marked content-holding may have videos attached to its nodes. This is
  // what makes "videos hang off topics, never off chapters" a rule the API enforces
  // rather than a convention the UI hopes for.
  canHoldContent Boolean          @default(false)

  @@unique([schemaId, depth])
  @@unique([schemaId, name])
}

// One row per (gradeLevel, subject) that exists on the platform. The licensing unit, the
// tree root, and the binding point for the level vocabulary.
//
// This model carries a tenant-scoped back-relation (`entitlements`), so Curriculum queries
// enter the tenant guard's nested walker. Reads that select only scalar columns still pass
// straight through — never `include` this relation from a Curriculum root; query
// SchoolContentEntitlement directly instead.
model Curriculum {
  id           String                     @id @default(cuid())
  gradeLevelId String
  gradeLevel   GradeLevel                 @relation(fields: [gradeLevelId], references: [id])
  subjectId    String
  subject      Subject                    @relation(fields: [subjectId], references: [id])
  schemaId     String
  schema       CurriculumSchema           @relation(fields: [schemaId], references: [id])
  status       CurriculumStatus           @default(DRAFT)
  publishedAt  DateTime?
  nodes        ContentNode[]
  entitlements SchoolContentEntitlement[]
  createdAt    DateTime                   @default(now())
  updatedAt    DateTime                   @updatedAt

  @@unique([gradeLevelId, subjectId])
  @@index([status])
}

// The tree. Adjacency list for structure plus a materialized path for subtree reads.
//
// The path exists so a subtree can be selected with an indexed prefix match instead of a
// recursive CTE — a CTE would need $queryRaw, which raw-sql-guard.spec.ts fails the build
// on outside its allow-list.
model ContentNode {
  id           String        @id @default(cuid())
  curriculumId String
  curriculum   Curriculum    @relation(fields: [curriculumId], references: [id], onDelete: Cascade)
  parentId     String?
  parent       ContentNode?  @relation("ContentNodeChildren", fields: [parentId], references: [id], onDelete: Cascade)
  children     ContentNode[] @relation("ContentNodeChildren")
  // Mirrors a CurriculumLevel.depth on this curriculum's schema. Denormalized so a level
  // lookup does not require walking to the root on every read.
  depth        Int
  // "/<rootId>/<childId>/.../<selfId>/". Leading AND trailing slash so a prefix match
  // cannot let "/abc1/" match "/abc10/".
  path         String
  // Stable, human-authored handle. Makes bulk import idempotent and re-runnable.
  code         String
  title        String
  description  String?
  // Gap-allocated (1000, 2000, ...) so a drag-reorder rewrites one row, not the whole
  // sibling set.
  sortOrder    Int
  videos       Video[]
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  @@unique([curriculumId, code])
  @@index([curriculumId, path])
  @@index([parentId, sortOrder])
  @@index([curriculumId, depth])
}
```

### Changed models

**`Video`** — drop `gradeLevelId` / `subjectId` / `gradeLevel` / `subject`; drop `@@index([gradeLevelId, subjectId])`.

```prisma
  contentNodeId String
  node          ContentNode @relation(fields: [contentNodeId], references: [id])

  @@index([contentNodeId])
```

Non-null: a video always belongs to a node. The admin picks one at ingest, so there is no window where a video exists outside the tree.

**`SchoolContentEntitlement`** — drop `gradeLevelId` / `subjectId` / their relations.

```prisma
  curriculumId String
  curriculum   Curriculum @relation(fields: [curriculumId], references: [id])

  @@unique([schoolId, curriculumId])
  @@index([schoolId])
  @@index([curriculumId])
```

**`GradeLevel`** — drop `videos Video[]` and `entitlements SchoolContentEntitlement[]`; add `curricula Curriculum[]`. Keep `sections Section[]` and its existing nested-walker comment (that relation is still why `GradeLevel` enters the walker).

**`Subject`** — drop `videos Video[]` and `entitlements SchoolContentEntitlement[]`; add `curricula Curriculum[]`. Keep `teacherAssignments` and its comment.

### Model registration

`apps/api/src/prisma/tenant-scoped-models.ts` — add to `PLATFORM_GLOBAL_MODELS`:

```ts
  'CurriculumSchema',
  'CurriculumLevel',
  'Curriculum',
  'ContentNode',
```

`tenant-model-coverage.spec.ts` fails the build until this lands. `TENANT_SCOPED_MODELS` is unchanged — `SchoolContentEntitlement` is still the only tenant-scoped row in this subsystem, which is the whole point.

### Applying it

```bash
npx prisma migrate reset --force          # from apps/api — wipes and replays
npx prisma migrate dev --name curriculum_tree
npm run db:seed                           # super admin only, unchanged
```

---

# 2. New API module: `apps/api/src/curriculum/`

```
curriculum.module.ts
content-node-path.util.ts              # pure helpers: path build, prefix rewrite, cycle check
content-node-path.util.spec.ts
curriculum-schemas.service.ts          # level vocabularies
curriculum-schemas.service.spec.ts
curriculum-schemas-admin.controller.ts
curricula.service.ts                   # Curriculum CRUD, publish/unpublish
curricula.service.spec.ts
curricula-admin.controller.ts
content-nodes.service.ts               # tree mutations + path/sortOrder maintenance
content-nodes.service.spec.ts
content-nodes-admin.controller.ts
content-tree.service.ts                # read assembly, admin and school-facing
content-tree.service.spec.ts
curricula.controller.ts                # school-facing reads (TEACHER, STUDENT)
curriculum-access.policy.ts            # ResourceAccessPolicy<{ id: string }>
curriculum-access.policy.spec.ts
dto/
  create-curriculum-schema.dto.ts      # name, code, levels: CurriculumLevelDto[]
  update-curriculum-schema.dto.ts
  curriculum-level.dto.ts              # depth, name, canHoldContent
  create-curriculum.dto.ts             # gradeLevelId, subjectId, schemaId
  update-curriculum.dto.ts             # schemaId
  list-curricula-query.dto.ts          # gradeLevelId?, subjectId?, status?, page, limit
  create-content-node.dto.ts           # parentId | null, code, title, description?
  update-content-node.dto.ts           # title?, description?, code?
  move-content-node.dto.ts             # parentId | null, position
entities/
  curriculum-schema.entity.ts
  curriculum-level.entity.ts
  curriculum.entity.ts                 # + gradeLevelName, subjectName, nodeCount, videoCount
  curriculum-detail.entity.ts          # + levels
  content-node.entity.ts
  content-tree.entity.ts               # recursive: node + children[] + videos[]
```

No `@BypassTenantScope()` anywhere in this module: every model it touches is platform-global, and the one tenant-scoped relation (`Curriculum.entitlements`) is never included from a `Curriculum` root. A `SUPER_ADMIN` with a null `schoolId` reads these tables cleanly.

### Routes

Admin — `@Roles(Role.SUPER_ADMIN)`:

| Route | Notes |
| --- | --- |
| `GET /admin/curriculum-schemas` | |
| `POST /admin/curriculum-schemas` | levels created in the same transaction |
| `GET /admin/curriculum-schemas/:id` | |
| `PATCH /admin/curriculum-schemas/:id` | 409 if a level is removed while curricula have nodes at that depth |
| `DELETE /admin/curriculum-schemas/:id` | 409 if any curriculum references it |
| `POST /admin/curriculum-schemas/:id/clone` | "same as Maths, one level deeper" |
| `GET /admin/curricula` | filter by grade/subject/status, paginated |
| `POST /admin/curricula` | 409 on duplicate `(gradeLevelId, subjectId)`; 409 if subject is `RETIRED` |
| `GET /admin/curricula/:id` | detail + schema levels |
| `PATCH /admin/curricula/:id` | schema swap; 409 if existing nodes exceed the new schema's depth |
| `POST /admin/curricula/:id/publish` | 409 if the tree is empty |
| `POST /admin/curricula/:id/unpublish` | back to `DRAFT`; schools lose visibility immediately |
| `DELETE /admin/curricula/:id` | 409 if any entitlement or video references it |
| `GET /admin/curricula/:id/tree` | full tree, every video status, `DRAFT` included |
| `POST /admin/curricula/:id/nodes` | create child |
| `PATCH /admin/content-nodes/:id` | rename / re-code |
| `POST /admin/content-nodes/:id/move` | reparent **and** reorder in one call |
| `DELETE /admin/content-nodes/:id` | 409 if the subtree holds videos |

School-facing — originally `@Roles(Role.TEACHER, Role.STUDENT)`, matching `VideosController`'s role set at the time.

> Superseded 2026-08-07: SCHOOL_ADMIN now shares the entitled browse/watch surface; platform authoring remains SUPER_ADMIN-only.

| Route | Notes |
| --- | --- |
| `GET /curricula` | published curricula inside the actor's scope |
| `GET /curricula/:id/tree` | nested nodes + `READY` video stubs; 404 if unentitled or `DRAFT` |

**18 new `MATRIX` rows** in `rbac-matrix.e2e-spec.ts`, in the same commit.

### Path and ordering mechanics

Constants: `SORT_ORDER_GAP = 1000`.

**Create** (`ContentNodesService.create`)
1. Load parent (null for depth 1) and assert it belongs to this curriculum.
2. `targetDepth = parent ? parent.depth + 1 : 1`.
3. Load the curriculum's schema levels; if none has `depth === targetDepth`, throw `409 "This curriculum's schema has no level at that depth"`.
4. `sortOrder = max(siblings.sortOrder) + SORT_ORDER_GAP`.
5. In one `$transaction`: create the row, then update its `path` to `` `${parent?.path ?? '/'}${created.id}/` ``. Two writes because the path derives from the generated id — the same pattern `VideosService.create` already uses for `sourceKey`.

**Move** (`ContentNodesService.move`)
1. Target parent must be in the same curriculum. Moving across curricula is a `409` — the licensing unit would change under the content.
2. Cycle check: refuse if `newParent.path.startsWith(node.path)`.
3. Depth check: `subtreeHeight = max(descendant.depth) - node.depth`; refuse if `newDepth + subtreeHeight` exceeds the schema's deepest level.
4. Content check: if any node in the subtree carries videos, its new level must still have `canHoldContent`.
5. Read descendants with `where: { path: { startsWith: node.path } }`, rewrite each path by swapping the old prefix for the new, adjust each `depth` by the same delta, and write them in one `$transaction`. O(subtree) writes on a rare admin action — the deliberate alternative to a raw recursive CTE.
6. Re-space siblings at the destination around `position`.

**Delete** — `onDelete: Cascade` on the self-relation removes the subtree; the service refuses first if any descendant holds a video, so cascade never silently destroys content.

---

# 3. Changed API files

### `apps/api/src/entitlements/`

**`content-entitlements.service.ts`** — `EntitledPair` is deleted.

```ts
export interface EntitledCurriculum {
  curriculumId: string;
  gradeLevelId: string;
}

isEntitled(curriculumId: string): Promise<boolean>
listEntitledCurricula(): Promise<EntitledCurriculum[]>
```

`listEntitledCurricula` selects `{ curriculumId, curriculum: { select: { gradeLevelId: true } } }` and filters `curriculum: { status: PUBLISHED }`. A to-one include of a platform-global child from a tenant-scoped root is allowed by the walker (the refused shape is the reverse). Filtering on `PUBLISHED` here means an unpublished curriculum can never enter anyone's scope, at any call site.

Still takes no school id — the invariant that makes this service safe is untouched.

**`actor-content-scope.service.ts`** — `ContentScope` becomes `'all' | string[]` (curriculum ids).

```ts
async resolve(actor: ActorScope): Promise<ContentScope> {
  if (actor.role === Role.SUPER_ADMIN) return 'all';
  const entitled = await this.entitlements.listEntitledCurricula();
  if (actor.role === Role.STUDENT) {
    const gradeLevelId = await this.enrollments.activeGradeLevelIdFor(actor.userId);
    if (!gradeLevelId) return [];
    return entitled.filter((c) => c.gradeLevelId === gradeLevelId).map((c) => c.curriculumId);
  }
  return entitled.map((c) => c.curriculumId);
}

async includes(actor: ActorScope, curriculumId: string): Promise<boolean>
```

No `PrismaService` injected — the grade level rides along on `EntitledCurriculum`, keeping data access in the entitlements service. The `includes`-derives-from-`resolve` property and the deferred-TEACHER-narrowing comment both carry over verbatim.

**`content-entitlements-admin.service.ts`** — `pairKey()` deleted; the dedupe collapses to a plain `Set<string>`.
- `grant(schoolId, { curriculumId })`, `replaceForSchool(schoolId, { curriculumIds })`, `revoke` unchanged.
- Retired-subject rule survives in the same shape: a *new* grant on a curriculum whose subject is `RETIRED` is a 409; grants already held stay live and are excluded from the revocation diff.
- Granting a `DRAFT` curriculum is **allowed** — an operator may pre-license before publish. Nothing leaks, because the read path filters `PUBLISHED`. This avoids a publish-then-grant sequencing trap.
- `ENTITLEMENT_SELECT` joins through `curriculum` for the grade/subject display names.

**`dto/grant-entitlement.dto.ts`** → `curriculumId`.
**`dto/replace-entitlements.dto.ts`** → `curriculumIds: string[]`; `EntitlementPairDto` deleted.
**`entities/entitlement.entity.ts`** → `{ id, schoolId, curriculumId, gradeLevelId, gradeLevelName, subjectId, subjectName, curriculumStatus, grantedAt }`.
**`content-impact.service.ts`** → `get(curriculumId)`; video count becomes `video.count({ where: { node: { curriculumId } } })`; student count resolves the grade level from the curriculum.
**`dto/content-impact-query.dto.ts`** → `curriculumId`.
**`content-impact.controller.ts`**, **`entitlements-admin.controller.ts`** → signatures and Swagger text.

### `apps/api/src/videos/`

**`videos.service.ts`**
- `VIDEO_SELECT`: drop `gradeLevelId` / `subjectId`; add `contentNodeId` and `node: { select: { curriculumId, title, curriculum: { select: { gradeLevelId, subjectId } } } }`.
- `findAllVisibleTo`: `where: { status: READY, node: { curriculumId: { in: scope }, curriculum: { status: PUBLISHED } } }`. The empty-scope early return stays — an empty `in` behaves, but the early return is clearer and already there.
- `findOneVisibleTo` / `findPlayableVisibleTo`: same `PUBLISHED` narrowing in the `where`, policy unchanged in shape.
- `PlayableVideo`: `gradeLevelId` / `subjectId` → `curriculumId`.
- `assertTaxonomyUsable(gradeLevelId, subjectId)` → `assertNodeUsable(contentNodeId)`: node exists; its curriculum is not `ARCHIVED`; its level has `canHoldContent`; its subject is not `RETIRED`.
- `create` / `update`: take `contentNodeId`.
- `findAllForAdmin`: `gradeLevelId` / `subjectId` filters route through `node: { curriculum: { ... } }`; add `curriculumId` and `contentNodeId` filters.

**`videos-access.policy.ts`** — `EntitleableVideo` becomes `{ curriculumId: string }`; `canRead` calls `contentScope.includes(actor, video.curriculumId)`.

**`dto/create-video.dto.ts`**, **`dto/update-video.dto.ts`**, **`dto/list-admin-videos-query.dto.ts`** — `contentNodeId`.
**`entities/video.entity.ts`**, **`admin-video.entity.ts`** — carry `contentNodeId`, `contentNodeTitle`, `curriculumId`, plus `gradeLevelId` / `subjectId` read through the join so existing list UIs keep their labels.
**`videos.module.ts`** — no new imports; node validation is a direct Prisma read.

### `apps/api/src/taxonomy/taxonomy.service.ts`

- `deleteGradeLevel`: counts become `curriculum.count({ where: { gradeLevelId } })` + `section.count({ where: { gradeLevelId } })`. The curriculum count subsumes the old video and entitlement counts — both now sit behind it.
- `updateSubject` retiring check: `curriculum.count({ where: { subjectId } })` + `teacherAssignment.count({ where: { subjectId } })`.
- Both keep the existing "root the count at the referencing model" comment — the reasoning is unchanged.
- Messages updated to name curricula.

### `apps/api/src/app.module.ts`

Register `CurriculumModule`.

---

# 4. `packages/shared-types/src/index.ts`

- New `CurriculumStatus` enum, with the standard "mirrors schema.prisma" comment.
- New interfaces: `CurriculumSchema`, `CurriculumLevel`, `Curriculum`, `CurriculumDetail`, `ContentNode`, `ContentTreeNode` (recursive: `children: ContentTreeNode[]`, `videos: Video[]`), `ContentTree`.
- New inputs: `CreateCurriculumSchemaInput`, `UpdateCurriculumSchemaInput`, `CreateCurriculumInput`, `UpdateCurriculumInput`, `CreateContentNodeInput`, `UpdateContentNodeInput`, `MoveContentNodeInput`.
- Changed: `Video` / `AdminVideo` gain `contentNodeId`, `contentNodeTitle`, `curriculumId`; `CreateVideoInput` / `UpdateVideoInput` / `ListAdminVideosQuery` take `contentNodeId`; `Entitlement` re-keys to `curriculumId`; `GrantEntitlementInput` → `{ curriculumId }`; `ReplaceEntitlementsInput` → `{ curriculumIds }`.

---

# 5. Web (`apps/web`)

### `src/lib/api-client.ts`

New: `apiListCurriculumSchemas`, `apiCreateCurriculumSchema`, `apiUpdateCurriculumSchema`, `apiCloneCurriculumSchema`, `apiDeleteCurriculumSchema`, `apiListCurricula`, `apiCreateCurriculum`, `apiGetCurriculum`, `apiUpdateCurriculum`, `apiPublishCurriculum`, `apiUnpublishCurriculum`, `apiDeleteCurriculum`, `apiGetAdminCurriculumTree`, `apiCreateContentNode`, `apiUpdateContentNode`, `apiMoveContentNode`, `apiDeleteContentNode`, `apiListMyCurricula`, `apiGetCurriculumTree`.

Changed: `apiCreateVideo`, `apiUpdateVideo`, `apiListAdminVideos` (`contentNodeId`); `apiGrantEntitlement`, `apiReplaceEntitlements` (`curriculumId` / `curriculumIds`); `apiGetContentImpact` (`curriculumId`).

### New routes

```
src/app/dashboard/curriculum/
  page.tsx                                  # grade x subject grid, status chips, "create"
  loading.tsx
  _components/create-curriculum-form.tsx
  schemas/
    page.tsx                                # level-vocabulary library
    loading.tsx
    _components/schema-form.tsx
    _components/level-list-editor.tsx       # 'use client' — ordered rows, canHoldContent
  [id]/
    page.tsx                                # tree builder (server: fetches tree + levels)
    loading.tsx
    _components/content-tree-editor.tsx     # 'use client' — the only stateful piece
    _components/node-form.tsx
    _components/publish-controls.tsx
```

The tree editor labels its buttons from the schema — literally "Add Chapter", "Add Topic" — so the configuration is visible in the UI rather than implied.

### New BFF route handlers (`src/app/api/`)

`curricula/[id]/nodes/route.ts`, `curricula/[id]/publish/route.ts`, `curricula/[id]/unpublish/route.ts`, `content-nodes/[id]/route.ts`, `content-nodes/[id]/move/route.ts` — the tree editor is a client component and must not see a JWT.

### Changed routes

- `src/components/content/content-node-picker.tsx` — **new shared component** (not `_components/`): used by both the video metadata form and the ingest panel, so it is a second use from day one.
- `src/app/dashboard/content-library/_components/video-metadata-form.tsx` and `video-ingest-panel.tsx` — grade + subject selects replaced by curriculum → node picker.
- `src/app/dashboard/content-library/page.tsx` — filters gain curriculum; rows show the node path.
- `src/app/dashboard/entitlements/[schoolId]/page.tsx` and its `_components/` — the checkbox matrix stays a grade × subject grid (curricula are keyed by that pair), but a cell is only checkable where a `Curriculum` exists. Cells with no curriculum render disabled with a "not authored yet" hint. Save posts `curriculumIds`.
- `src/app/dashboard/videos/page.tsx` — curriculum cards instead of a flat video grid.
- `src/app/dashboard/videos/[curriculumId]/page.tsx` — **new**: the tree the student browses, collapsible, video counts per node.
- `src/app/dashboard/videos/[curriculumId]/[videoId]/page.tsx` — the existing `videos/[id]/page.tsx` player moved here, giving breadcrumbs.
- `src/lib/nav.ts` — add "Curriculum" (`SUPER_ADMIN`).

---

# 6. Tests

### Fixtures — `apps/api/test/utils/content-fixtures.ts` (rewrite)

Provision, on top of the existing Grade 5 / Grade 6 and maths / science:
- one `CurriculumSchema` `"standard"` with levels `1: Chapter (canHoldContent: false)`, `2: Topic (canHoldContent: true)`
- `PUBLISHED` curricula for (G5, maths), (G5, science), (G6, maths)
- one `DRAFT` curriculum for (G6, science) — the fixture that proves publish gating
- one chapter + two topics per published curriculum
- the three existing videos re-hung on topic nodes
- the entitlement: `demo-school` → the (G5, maths) curriculum **only**; `demo-school-b` → none

The asymmetry is preserved deliberately — it is the fixture the entitlement tests assert against, and granting more makes them pass vacuously. Export the new ids (`standardSchemaId`, `g5MathsCurriculumId`, `g5ScienceCurriculumId`, `g6MathsCurriculumId`, `draftCurriculumId`, node ids) alongside the existing ones.

### New e2e specs

`apps/api/test/curriculum.e2e-spec.ts`
- schema CRUD; delete refused while referenced
- curriculum create; duplicate pair → 409; retired subject → 409
- node create at a depth the schema lacks → 409
- video attach to a non-content-holding level → 409
- move creating a cycle → 409; move exceeding schema depth → 409
- move rewrites every descendant path and depth
- delete a subtree holding videos → 409
- publish with an empty tree → 409

`apps/api/test/content-tree.e2e-spec.ts`
- teacher in `demo-school` sees the (G5, maths) tree
- `teacher-b@` in `demo-school-b` gets an empty curriculum list — the unentitled-tenant proof
- student sees only Grade 5 curricula, never Grade 6
- student with no active enrollment sees nothing
- `DRAFT` curriculum is a 404 even when granted
- cross-tenant curriculum id → 404, never 403

### Updated specs

`rbac-matrix.e2e-spec.ts` (18 rows), `entitlements.e2e-spec.ts`, `playback.e2e-spec.ts`, `videos.e2e-spec.ts`, `schools.e2e-spec.ts` if it touches entitlements.

### Unit specs

New: `content-node-path.util.spec.ts` (path build, prefix rewrite, cycle detection, depth delta), `content-nodes.service.spec.ts`, `curricula.service.spec.ts`, `curriculum-schemas.service.spec.ts` (levels must be contiguous 1..N), `content-tree.service.spec.ts`, `curriculum-access.policy.spec.ts`.

Updated: `actor-content-scope.service.spec.ts`, `videos.service.spec.ts`, `videos-access.policy.spec.ts`, `content-entitlements-admin.service.spec.ts`, `taxonomy.service.spec.ts`.

---

# 7. Order of work

Each step ends green (`lint`, `build`, `test:e2e`).

1. **Schema + registration.** Models, `PLATFORM_GLOBAL_MODELS`, reset, migrate. Build is red until step 2 — expected.
2. **Entitlement + scope re-key.** `ContentEntitlementsService`, `ActorContentScopeService`, admin service, DTOs, entities, `ContentImpactService`, taxonomy guards. Restores the build.
3. **Videos re-key.** Service, policy, DTOs, entities, playback shape.
4. **Fixtures + existing e2e.** Rewrite `content-fixtures.ts`, repair the suites. **Green checkpoint — behaviour is identical to today, on the new key.**
5. **Curriculum module — schemas + curricula.** Services, controllers, DTOs, entities, `MATRIX` rows, unit specs.
6. **Curriculum module — nodes + tree.** Path util first with its spec, then mutations, then read assembly. `curriculum.e2e-spec.ts`.
7. **School-facing reads.** `GET /curricula`, `GET /curricula/:id/tree`, `content-tree.e2e-spec.ts`.
8. **Shared types.**
9. **Web — admin.** api-client, schema library, curriculum list, tree builder, BFF handlers, node picker, entitlement grid.
10. **Web — student/teacher.** Curriculum cards, tree browse, player move, nav.

Steps 1–4 are one PR's worth of work and land as a pure re-key with no user-visible change. 5–7 add authoring. 8–10 add the surfaces.

---

# 8. Deliberately not in scope

- **Bulk curriculum import.** The natural follow-up, and it should reuse the `TeacherImportBatch` DRAFT → preview → commit handshake exactly — same staging-`Json` shape, same 24h prune. A `CurriculumImportBatch` model plus a CSV with one column per level. This is the path that onboards a publisher's catalogue at volume, and it should not block the core feature.
- **Per-subtree entitlements.** The `path` column makes this a `SchoolContentEntitlement.contentNodeId` plus a prefix filter, with no redesign. Not built.
- **Versioned curriculum revisions.** Rejected for now; edits to a published curriculum go live.
- **TEACHER narrowing.** Still deferred, unchanged by this work — every teacher continues to resolve to the school's full entitlement set. When it lands it narrows inside `ActorContentScopeService.resolve`, and every content read narrows with it.
- **Non-video content types** (PDF, quiz, worksheet). `ContentNode` is the attach point when they arrive; nothing here forecloses them.
- **Search across the tree.** Flat video search already exists on the admin library.

---

# 9. Risks

| Risk | Handling |
| --- | --- |
| Subtree move is O(n) writes | Bounded by realistic subtree size and confined to a rare admin action. The alternative is a recursive CTE via `$queryRaw`, which the raw-SQL guard forbids. |
| `Curriculum` enters the tenant guard's nested walker | Same class of hazard as `GradeLevel` and `Subject` today, handled the same way: a schema comment plus the rule that `entitlements` is never included from a `Curriculum` root. |
| Publish/unpublish is immediate and global | Intentional. `unpublish` is the escape hatch; an operator building structure works in `DRAFT`. |
| Schema edits can strand nodes below a removed level | `PATCH /admin/curriculum-schemas/:id` refuses to remove a level while any curriculum has nodes at that depth. |
| Entitlement UI can offer a cell with no curriculum | Cells render disabled where no `Curriculum` exists, with a link to author one. |
