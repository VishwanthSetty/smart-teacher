# School admin sets teacher/student passwords directly

**Date:** 2026-08-07
**Status:** Planned — awaiting approval
**Scope:** `apps/api` (teachers, students, passwords, mail, auth), `apps/web` (dashboard + BFF), `packages/shared-types`, Prisma migration

## Context

Today a SCHOOL_ADMIN can only *invite* teachers and students. `TeachersService.create`, `StudentsService.create` and both CSV import confirm paths all do the same thing: create the user as `PENDING` with a 7-day invite token and email a `/set-password` link. The user cannot log in until they click that link.

In practice many student and teacher email addresses are wrong, stale, or shared, so the invite never arrives and the account is stranded in `PENDING`. The school admin needs to hand out credentials on paper instead.

**Outcome:** the admin supplies (or the API generates) a password at creation time — from the form or from a `password` column in the CSV — and the account is immediately `ACTIVE` and usable. The admin can read that password back at any time, and can reset it for an existing teacher or student. Invite emails are removed from the teacher and student paths entirely.

### Decisions taken (confirmed with the user)

| Decision | Choice |
| --- | --- |
| Password storage | **Plaintext column on `User`**, so the admin can read it back. Flagged as a security risk (any DB dump, backup, replica or query log exposes every credential in the clear); the user reviewed the encrypted-at-rest alternative and chose plaintext. Recorded here so the trade-off is not re-litigated silently later. |
| Blank password | **Auto-generate** a readable password (`Teal-Fox-7412` shape). A blank form field or blank CSV cell never fails — it produces a generated password the admin reads back. |
| CSV | One new optional `password` column. |
| Emails | **Removed** from teacher/student create + import. Retained: SCHOOL_ADMIN invites via `POST /admin/users`, password reset, school-admin welcome. |
| "Send invite" checkbox | Kept as **one global, default-OFF checkbox** on the single-create form and the bulk-confirm step. Since accounts are now ACTIVE with a known password, it sends a *credentials* email (email + password + login link), not a set-password link. Send failures are counted, never fatal — the account already exists and the admin already has the password. |
| Existing users | **Yes** — reveal + reset password row action for teachers and students. |

`bcrypt` `passwordHash` still backs actual login, unchanged. The plaintext column is an admin-readable copy, never an auth input.

---

## Step 1 — `PasswordsService` (new module)

New service-only module mirroring the shape of `apps/api/src/invites/` (module + service + spec, no controller, no DTOs):

- `apps/api/src/passwords/passwords.module.ts` — provides + exports `PasswordsService`
- `apps/api/src/passwords/passwords.service.ts`
- `apps/api/src/passwords/passwords.service.spec.ts`

```ts
export interface PasswordMaterial { password: string; passwordHash: string; }

// Resolve: use the supplied password, or generate one when blank.
resolve(password: string | undefined, email: string): Promise<PasswordMaterial>
generate(): string                       // e.g. "Teal-Fox-7412" — readable aloud, 12+ chars
assertAcceptable(password, email): void  // min 8; must not equal the email (case-insensitive)
```

`assertAcceptable` centralises the "password must not match the email" rule currently duplicated in [invites.service.ts:62-64](../apps/api/src/invites/invites.service.ts#L62-L64), [password-reset.service.ts:115-117](../apps/api/src/auth/password-reset.service.ts#L115-L117) and [schools.service.ts:32-34](../apps/api/src/schools/schools.service.ts#L32-L34), and the `BCRYPT_ROUNDS = 10` constant duplicated in four files. **Do not refactor those three call sites in this change** — note it and leave them; this module only has to be the single source of truth for the new paths.

Generation uses `crypto.randomInt` over fixed word lists (no ambiguous chars), not `Math.random`.

## Step 2 — Schema + migration

`apps/api/prisma/schema.prisma`, `model User`:

```prisma
  // Admin-readable copy of the password for tenant users the school admin provisions
  // directly. Deliberately plaintext: schools hand out credentials on paper because
  // student/teacher mailboxes are frequently invalid, and the admin must be able to
  // read the password back. `passwordHash` remains the only value login checks.
  plainPassword        String?
```

Run `npm run db:migrate` and commit the migration. `User` is already in `TENANT_SCOPED_MODELS`, so no coverage change.

**Audit that `plainPassword` never leaks by default.** It must not appear in `USER_SELECT` ([users.service.ts:13-21](../apps/api/src/users/users.service.ts#L13-L21)), `TeacherEntity`, `StudentEntity`, `MeEntity`, or the `LoggingInterceptor`. `TeachersService`/`StudentsService` fetch the whole row but map to explicit entities — keep it that way.

## Step 3 — Single-create paths

### `apps/api/src/teachers/dto/create-teacher.dto.ts`

```ts
  @ApiProperty({ required: false, description: 'Left blank, a password is generated and returned to the admin.' })
  @IsOptional() @IsString() @MinLength(8) @MaxLength(72)   // 72 = bcrypt's input limit
  password?: string;

  @ApiProperty({ required: false, default: false })
  @IsOptional() @IsBoolean()
  sendCredentialsEmail?: boolean;
```

Same two fields on `apps/api/src/students/dto/create-student.dto.ts`.

### `apps/api/src/teachers/teachers.service.ts` and `students/students.service.ts`

In `create()`, replace the `invitesService.mintToken()` block with `passwordsService.resolve(dto.password, dto.email)`, and the created-user data with:

```ts
status: UserStatus.ACTIVE,
activatedAt: new Date(),
passwordHash,
plainPassword: password,
// inviteTokenHash / inviteTokenExpiresAt: omitted entirely
```

Replace the post-transaction `mailService.sendUserInvite(...)` with a guarded `sendCredentials` (Step 6) inside `try/catch` that logs and swallows — the account exists and the admin has the password, so a bad mailbox must not fail the request. Drop `InvitesService` from both constructors; keep `MailService`. Update `TeachersModule`/`StudentsModule` imports (`PasswordsModule` in, `InvitesModule` out).

The create response returns the resolved password once (`password` on `TeacherEntity`/`StudentEntity`, documented as "returned only on create") so the form can show it immediately.

## Step 4 — CSV import (teachers and students, symmetric)

Files per side: `*-import.constants.ts`, `*-import.parser.ts`, `*-import-csv.ts`, `*-import.service.ts`, `entities/*-import.entity.ts`.

**Constants** — append `'password'` to `IMPORT_TEMPLATE_HEADERS`; leave `REQUIRED_HEADERS` unchanged (blank ⇒ generated). Add `MAX_PASSWORD_LENGTH = 72` / `MIN_PASSWORD_LENGTH = 8`.

**Parser** — read the `password` cell, do **not** lowercase or trim-collapse it beyond the existing `trim()`. Two new error codes on `TeacherImportErrorCode` / `StudentImportErrorCode`:

- `PASSWORD_TOO_SHORT` — "Password must be at least 8 characters."
- `PASSWORD_MATCHES_EMAIL` — "Password must be different from the email address."

Carry `password: string` on `ParsedTeacherRow`/`ParsedStudentRow` (the batch JSON needs it to commit).

**Preview must not echo passwords.** `toPreview()` in both import services strips `password` from each valid row and substitutes `hasPassword: boolean`. The API type (`TeacherImportRow` in `packages/shared-types`) gains `hasPassword` and never gains `password`. The preview table then renders "Provided" vs "Auto-generated".

**Error report** (`*-import-csv.ts`) — `ERROR_REPORT_HEADERS` keeps the template's column list including `password`, but the cell is **always emitted blank**. Add a comment: the admin refills it or leaves it blank for generation; the report must never write credentials to a downloaded file.

*Known consequence of the plaintext decision:* a DRAFT batch's `validRows` JSON holds supplied passwords in Postgres for up to `DRAFT_BATCH_TTL_MS` (24h). Existing opportunistic pruning covers it.

**Confirm** ([teacher-import.service.ts:131-259](../apps/api/src/teachers/teacher-import.service.ts#L131-L259) and the student equivalent) — inside the chunk loop, replace `chunk.map(() => this.invitesService.mintToken())` with `await Promise.all(chunk.map((row) => this.passwords.resolve(row.password, row.email)))`, and the `createManyAndReturn` data with `status: ACTIVE`, `activatedAt: new Date()`, `passwordHash`, `plainPassword`, no invite columns. Everything else — chunking, in-transaction re-validation, `TeacherAssignment` / `enrollments.enrollMany` writes, P2002 handling, `COMMITTED` marking — is untouched.

Replace `dispatchInvites` with `dispatchCredentials`, called only when the confirm request body carries `sendCredentialsEmail: true` (new optional `ConfirmImportDto` on `POST /{teachers,students}/bulk/:batchId/confirm`). Same "count, don't throw" contract.

`TeacherImportResult` / `StudentImportResult` (`packages/shared-types` + the entities): rename `invitesSent`/`invitesFailed` → `emailsSent`/`emailsFailed`.

## Step 5 — Reveal + reset for existing users

Four new routes, all `@Roles(Role.SCHOOL_ADMIN)`, tenant-scoped (a cross-tenant id 404s automatically):

| Route | Behaviour |
| --- | --- |
| `GET /teachers/:id/password` | Returns `{ password: string \| null }`. `null` when the user set their own via reset (no plaintext copy exists). 404 if the row is missing or `role !== TEACHER`. |
| `POST /teachers/:id/password` | Body `SetUserPasswordDto { password?: string }`. Blank ⇒ generate. Writes `passwordHash` + `plainPassword`, and in the **same `$transaction`** revokes every live `RefreshToken` with `RefreshTokenRevokeReason.PASSWORD_RESET` — copy the disable branch at [students.service.ts:231-236](../apps/api/src/students/students.service.ts#L231-L236). Returns `{ password }`. |
| `GET /students/:id/password` | Same, `role !== STUDENT` folded into the 404 exactly as `StudentsService.update` does. |
| `POST /students/:id/password` | Same. |

`apps/api/src/auth/password-reset.service.ts` must **null `plainPassword`** in its existing `$transaction` — once the user chooses their own password, the admin-readable copy is stale and must not be shown. Same in `InvitesService.redeem`.

**`apps/api/test/rbac-matrix.e2e-spec.ts`:** add the four rows in the same commit, `allow: [Role.SCHOOL_ADMIN]`, following the existing `PATCH /students/:id` entry's shape.

## Step 6 — Mail

`apps/api/src/mail/mail.service.ts` — new port method beside `sendUserInvite`:

```ts
export interface UserCredentials {
  email: string; name: string; role: Role;
  schoolName: string; schoolSlug: string; password: string;
}
abstract sendCredentials(credentials: UserCredentials): Promise<void>;
```

`smtp-mail.service.ts` — inline template like the others, linking to `${webAppUrl}/login?school=${slug}` (the same link `sendSchoolAdminWelcome` uses), stating the email and password and asking the user to change it after first login. `sendUserInvite` stays — `POST /admin/users` still uses it.

## Step 7 — Web

**BFF routes** (copy [api/teachers/route.ts](../apps/web/src/app/api/teachers/route.ts) verbatim, only the `api*` call changes):
`app/api/teachers/[id]/password/route.ts` (GET + POST), `app/api/students/[id]/password/route.ts` (GET + POST).

**`lib/api-client.ts`:** add `apiGetTeacherPassword` / `apiSetTeacherPassword` and the student pair; extend `CreateTeacherInput` / `CreateStudentInput` with `password?` and `sendCredentialsEmail?`; add the optional body to `apiConfirmTeacherImport` / `apiConfirmStudentImport`.

**Forms** — `dashboard/teachers/_components/create-teacher-form.tsx` and `dashboard/students/_components/create-student-form.tsx`: add a `password` text input labelled "Password (leave blank to generate one)" and a `sendCredentialsEmail` checkbox (bare `<input type="checkbox" className="rounded border-gray-300" />`, matching [create-school-form.tsx:155-166](../apps/web/src/app/dashboard/schools/_components/create-school-form.tsx#L155-L166)). On success, render the returned password in a copyable success panel *before* `router.refresh()` clears the form — it is the admin's only immediate copy.

**Row actions** — extend `students/_components/student-row-actions.tsx` and add a new `teachers/_components/teacher-row-actions.tsx` (there is none today) with "View password" and "Reset password". Follow the file's existing `window.confirm()` + `router.refresh()` idiom; no modal primitive exists and this change should not introduce one.

**Import panel** — `_components/import-upload-form.tsx` copy mentions the new optional `password` column; `import-preview-table.tsx` renders the `hasPassword` column as "Provided"/"Auto-generated"; `bulk-import-panel.tsx` gains the "Email credentials" checkbox on the confirm step and passes it through; `import-result-summary.tsx` drops the "resend their invite" copy (that action never existed) and reads `emailsSent`/`emailsFailed`.

Both list pages should stop rendering `PENDING` as "Invite sent" — with this change a directly-created teacher/student is `ACTIVE` from the start.

## Step 8 — Tests

Update: `teachers.service.spec.ts`, `students.service.spec.ts`, `teacher-import.service.spec.ts`, `student-import.service.spec.ts`, `teacher-import.parser.spec.ts`, `student-import.parser.spec.ts` (invite assertions → password assertions). New `passwords.service.spec.ts`.

New cases worth naming explicitly:
- `it('generates a password when the CSV cell is blank')`
- `it('rejects a row whose password matches its email')`
- `it('never returns the password in the import preview')`
- `it('revokes live sessions when an admin resets a password')`
- `it('clears the admin-readable password when the user resets their own')`
- e2e: a SCHOOL_ADMIN of school B gets 404, not 403, on school A's `GET /teachers/:id/password`.

---

## Verification

```bash
docker compose up -d postgres
npm run db:migrate            # confirm the plainPassword migration is generated + committed
npm run lint                  # no new warnings
npm run build
npm run test:e2e              # rbac-matrix must pass with the four new rows
npm run dev
```

End to end, as `superadmin@smartteacher.dev` / `Passw0rd!` → create a school + school admin → log in as that admin:

1. `/dashboard/teachers` → onboard a teacher with a typed password, invite checkbox off. Expect `ACTIVE` in the list and the password echoed in the success panel. **Log out and log in as that teacher with the typed password.**
2. Onboard a second teacher leaving the password blank → a generated password is shown, and logging in with it works.
3. Download the template → confirm the `password` header is present. Upload a file with one blank password, one 4-char password, one password equal to its email. Preview must show two invalid rows with `PASSWORD_TOO_SHORT` / `PASSWORD_MATCHES_EMAIL`, and the valid row as "Auto-generated". Confirm → check the response body and the network tab: **no password anywhere in the preview or the error-report CSV**.
4. Row action → "View password" shows it; "Reset password" changes it, and a session opened in a second browser as that teacher is logged out on its next refresh.
5. Repeat 1–4 on `/dashboard/students`.
6. Confirm no mail is sent for any of the above (SMTP logs / MailHog), and that mail *is* still sent for `POST /admin/users` and forgot-password.
