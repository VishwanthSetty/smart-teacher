# Stitch design prompts — Super Admin & School Admin

Copy-paste prompt library for designing the Smart Teacher web app in **Google Stitch**
(<https://stitch.withgoogle.com>).

Palette: <https://colorhunt.co/palette/e3f2fd90caf92196f30d47a1> — `#E3F2FD` `#90CAF9` `#2196F3` `#0D47A1`.
Direction: **Material-flavoured SaaS admin** — solid navy sidebar, white surfaces on a tinted canvas,
blue primary actions, dense-but-airy tables.

Every prompt below describes a screen that **actually exists** in `apps/web` with its real columns,
filters, status values and empty-state copy. Nothing here asks for data the API cannot supply.

---

## 1. How to use this

1. Create **one Web project** in Stitch. Choose the desktop/web canvas, not mobile.
2. Paste **§2 (design system prompt)** as the very first message. Everything generated afterwards in
   that project inherits it.
3. Then paste screen prompts **one at a time**, in the order given. Do super admin (§5) before
   school admin (§6) — the shared tables and forms get established once and reused.
4. **Refine in place.** After a screen generates, follow up with short edits ("make the status column
   a pill badge", "tighten row height to 44px") instead of regenerating from the full prompt. Stitch
   keeps the design system across edits; a fresh generate often drifts.
5. If Stitch loses context or you start a new chat, every prompt below is **self-contained** — each
   one repeats the `STYLE:` line, so it produces the right look on its own.
6. Export each approved screen (Stitch → copy code / Figma) and then use the **code-handoff prompts
   in §8** to have Claude Code apply it to the real Next.js pages.

**Practical notes on Stitch:** keep prompts under roughly 250 words or later details get dropped;
generate one screen per prompt (asking for "all admin screens" gives you one crowded mediocre page);
and name components with the same words every time ("stat tile", "filter tab strip", "row action
menu") so it reuses them rather than inventing variants.

---

## 2. Design system prompt — paste this FIRST

```
I am designing a web admin console called Smart Teacher — a multi-tenant platform where a
platform super admin manages schools and video/PDF curriculum content, and each school's admin
manages students, teachers and classes. Desktop-first, 1440px, responsive down to mobile.

Establish this design system and use it for every screen I ask for afterwards.

COLOR
- Navy #0D47A1 — sidebar background, page headings, primary button hover, active nav item.
- Blue #2196F3 — primary buttons, links, active tab underline, focus ring, selected checkbox.
- Soft blue #90CAF9 — borders on tinted surfaces, secondary chips, dividers, chart secondary.
- Blue tint #E3F2FD — page canvas wash, selected/hover table rows, badge and chip fills.
- Neutrals — white #FFFFFF surfaces, #F5F8FC canvas, #E2E8F0 borders, #64748B muted text,
  #0F172A body text.
- Status — green #16A34A (active, ready, published), amber #F59E0B (pending, queued, draft),
  red #DC2626 (disabled, failed, suspended), blue #2196F3 (processing, info).
Never use pure black. Never use a color outside this list.

TYPE — Inter. Page title 24px semibold #0F172A, page description 14px #64748B, section heading
18px medium, body and table cells 14px, table headers 12px uppercase letter-spaced #64748B,
captions 12px. Slugs, codes, IDs and storage keys in a monospace face at 12px.

SHAPE — 4px spacing scale, 24px page gutters, 8px radius on cards/inputs/buttons, 6px on badges,
9999px on chips. Two elevations only: cards get a 1px #E2E8F0 border plus a barely-there shadow;
dropdowns, drawers and dialogs get a soft medium shadow. No heavy drop shadows, no gradients
except an optional very subtle #E3F2FD wash behind the page header.

COMPONENTS to define once and reuse on every screen:
- Sidebar: 256px, #0D47A1 fill, product wordmark at top, nav items with icon + label, active
  item on a white 10% overlay with a 3px #90CAF9 left bar, user block pinned at the bottom.
- Top header: 64px, white, thin bottom border, page context on the left, search, notifications
  and an avatar menu on the right.
- Page header: title, one-line grey description, primary action button on the right.
- Stat tile: white card, 12px uppercase label, 32px semibold number, icon in a #E3F2FD circle,
  optional hint line, clickable.
- Filter tab strip: inline text tabs, active one in #2196F3 with an underline.
- Toolbar: search field with a leading magnifier, dropdown filters, ghost "Clear" link.
- Data table: white card, 12px uppercase header row, 48px rows, #E3F2FD hover, pill status
  badges, a right-aligned three-dot row action menu, footer with "Page X of Y · N total" and
  prev/next.
- Inline create form: collapsible white card above the table, fields in a responsive grid,
  primary submit on the right.
- Empty state: centred icon in an #E3F2FD circle, bold title, grey explanation, primary action.
- Skeleton loader, toast (success/error), confirm dialog, and a right-side drawer.

Acknowledge the system and show me a component sheet of these pieces before we start screens.
```

**Short `STYLE:` line** — prepend this to any prompt you paste into a *new* chat, or whenever
Stitch starts drifting:

```
STYLE: Smart Teacher admin console. Material-style SaaS admin, Inter. Sidebar #0D47A1 with white
text; canvas #F5F8FC; white cards, 1px #E2E8F0 border, 8px radius, subtle shadow. Primary #2196F3,
soft accent #90CAF9, tinted fills and selected rows #E3F2FD. Text #0F172A, muted #64748B. Status:
green #16A34A, amber #F59E0B, red #DC2626. 14px body, 12px uppercase table headers, pill badges,
48px table rows. Desktop web 1440px.
```

---

## 3. Tailwind tokens — apply after designs are approved

`apps/web/tailwind.config.ts` currently has an empty `theme.extend`. Once the designs are signed
off, this is the block to paste in so the generated markup maps onto real classes instead of raw hex:

```ts
theme: {
  extend: {
    colors: {
      brand: {
        navy: '#0D47A1',
        blue: '#2196F3',
        soft: '#90CAF9',
        tint: '#E3F2FD',
      },
      surface: {
        DEFAULT: '#FFFFFF',
        canvas: '#F5F8FC',
        border: '#E2E8F0',
      },
      ink: {
        DEFAULT: '#0F172A',
        muted: '#64748B',
      },
      status: {
        success: '#16A34A',
        warning: '#F59E0B',
        danger: '#DC2626',
        info: '#2196F3',
      },
    },
    borderRadius: { card: '0.5rem', badge: '0.375rem' },
    boxShadow: {
      card: '0 1px 2px 0 rgb(15 23 42 / 0.04)',
      overlay: '0 8px 24px -4px rgb(15 23 42 / 0.12)',
    },
  },
},
```

and in `apps/web/src/app/globals.css`, after the Tailwind directives:

```css
:root {
  --brand-navy: #0d47a1;
  --brand-blue: #2196f3;
  --brand-soft: #90caf9;
  --brand-tint: #e3f2fd;
  --surface-canvas: #f5f8fc;
  --surface-border: #e2e8f0;
  --ink: #0f172a;
  --ink-muted: #64748b;
}

body {
  background-color: var(--surface-canvas);
  color: var(--ink);
}
```

---

## 4. Screen inventory

Roles come from `NAV_ITEMS` in [nav.ts](apps/web/src/lib/nav.ts) — the single source of truth for
which role sees which route.

| # | Route | Role | Current state | Prompt |
| --- | --- | --- | --- | --- |
| — | app shell (sidebar/header/mobile nav) | all | real | §5.1 |
| — | `/login` | public | real | §5.2 |
| — | `/forgot-password`, `/reset-password` | public | real | §5.3 |
| — | `/set-password` | public | real | §5.4 |
| S1 | `/dashboard` | SUPER_ADMIN | real (1 tile) | §6.1 |
| S2 | `/dashboard/schools` | SUPER_ADMIN | real | §6.2 |
| S3 | `/dashboard/content-library` | SUPER_ADMIN | real | §6.3 |
| S4 | `/dashboard/content-library/[id]` | SUPER_ADMIN | real | §6.4 |
| S5 | `/dashboard/content-library/documents/[id]` | SUPER_ADMIN | real | §6.5 |
| S6 | `/dashboard/taxonomy` | SUPER_ADMIN | real | §6.6 |
| S7 | `/dashboard/curriculum` | SUPER_ADMIN | real | §6.7 |
| S8 | `/dashboard/curriculum/schemas` | SUPER_ADMIN | real | §6.8 |
| S9 | `/dashboard/curriculum/[id]` | SUPER_ADMIN | real | §6.9 |
| S10 | `/dashboard/entitlements` | SUPER_ADMIN | real | §6.10 |
| S11 | `/dashboard/entitlements/[schoolId]` | SUPER_ADMIN | real | §6.11 |
| S12 | `/dashboard/platform-settings` | SUPER_ADMIN | **stub** (`ComingSoon`) | §6.12 |
| A1 | `/dashboard` | SCHOOL_ADMIN | real (5 tiles) | §7.1 |
| A2 | `/dashboard/students` | SCHOOL_ADMIN, TEACHER | real | §7.2 |
| A3 | students/teachers bulk import (3 states) | SCHOOL_ADMIN | real | §7.3 |
| A4 | `/dashboard/teachers` | SCHOOL_ADMIN | real | §7.4 |
| A5 | `/dashboard/teachers/[id]` | SCHOOL_ADMIN | real | §7.5 |
| A6 | `/dashboard/classes` | SCHOOL_ADMIN, TEACHER | real | §7.6 |
| A7 | `/dashboard/timetable` | all | **stub** (`ComingSoon`) | §7.7 |
| A8 | `/dashboard/videos` | SCHOOL_ADMIN, TEACHER, STUDENT | real | §7.8 |
| A9 | `/dashboard/videos/[curriculumId]` + video + document leaves | same | real | §7.9 |
| A10 | `/dashboard/settings` | SCHOOL_ADMIN | **stub** (`ComingSoon`) | §7.10 |
| — | empty / loading / error / mobile states | all | `loading.tsx` exists per route | §8 |

---

## 5. Shell and auth

### 5.1 App shell

```
STYLE: Smart Teacher admin console. Material-style SaaS admin, Inter. Sidebar #0D47A1 with white
text; canvas #F5F8FC; white cards, 1px #E2E8F0 border, 8px radius, subtle shadow. Primary #2196F3,
soft accent #90CAF9, tinted fills and selected rows #E3F2FD. Text #0F172A, muted #64748B. Status:
green #16A34A, amber #F59E0B, red #DC2626. 14px body, 12px uppercase table headers, pill badges,
48px table rows. Desktop web 1440px.

Design the application shell for the Smart Teacher admin console — sidebar, top header, and the
mobile equivalent. Show it wrapping a generic content area.

Sidebar, 256px, #0D47A1: "Smart Teacher" wordmark with a small graduation-cap mark at the top.
Nav items are icon + label, 40px tall, white text at 85% opacity; the active item sits on a white
10% overlay with a 3px #90CAF9 bar down its left edge and full-white text.

Show two sidebar variants side by side:
A) Platform super admin — Dashboard, Schools, Content Library, Grade Levels & Subjects,
   Curriculum, School Entitlements, Platform Settings.
B) School admin — Dashboard, Students, Teachers, Classes & Sections, Timetable, Library, Settings.

Pinned at the bottom of the sidebar: a user block with a circular initials avatar, the person's
name in white, their role in #90CAF9 small caps, and a chevron opening an upward menu with
"Profile" and "Sign out".

Top header, 64px, white with a thin #E2E8F0 bottom border: on the left the school name (or
"Platform administration" for the super admin) as a small #64748B label; on the right a search
field, a bell icon, and a circular avatar.

Also show: a 72px collapsed icon-only sidebar rail, and the mobile layout with a bottom tab bar
of five icon+label items and a hamburger for the rest.
```

### 5.2 Login

```
STYLE: Smart Teacher admin console. Material-style SaaS admin, Inter. Sidebar #0D47A1 with white
text; canvas #F5F8FC; white cards, 1px #E2E8F0 border, 8px radius, subtle shadow. Primary #2196F3,
soft accent #90CAF9, tinted fills and selected rows #E3F2FD. Text #0F172A, muted #64748B. Status:
green #16A34A, amber #F59E0B, red #DC2626. 14px body, 12px uppercase table headers, pill badges,
48px table rows. Desktop web 1440px.

Design the sign-in page for Smart Teacher, a school content platform. Split screen at 1440px.

Left 45%: a #0D47A1 panel with a subtle darker-blue geometric pattern, the Smart Teacher wordmark
top-left in white, and centred on it a short headline "Teaching material, organised" with one
grey-blue supporting line. No stock photography.

Right 55%: white, a centred 400px form card with no border. Heading "Sign in", subtext "Use the
account your school gave you." Fields: Email address, Password with a show/hide eye toggle. A
"Forgot password?" link right-aligned under the password field in #2196F3. Full-width #2196F3
primary button "Sign in", 44px tall, 8px radius.

Show three states stacked below the main screen:
1. Default.
2. Error — a red #DC2626 banner above the fields reading "Invalid email or password", with both
   inputs outlined in red.
3. Locked out — an amber #F59E0B banner reading "Too many attempts. Try again in a few minutes."

Footer line, 12px #64748B, centred: "Trouble signing in? Contact your school administrator."
```

### 5.3 Forgot password and reset password

```
STYLE: Smart Teacher admin console. Material-style SaaS admin, Inter. Sidebar #0D47A1 with white
text; canvas #F5F8FC; white cards, 1px #E2E8F0 border, 8px radius, subtle shadow. Primary #2196F3,
soft accent #90CAF9, tinted fills and selected rows #E3F2FD. Text #0F172A, muted #64748B. Status:
green #16A34A, amber #F59E0B, red #DC2626. 14px body, 12px uppercase table headers, pill badges,
48px table rows. Desktop web 1440px.

Design two password screens for Smart Teacher, reusing the split layout of the sign-in page (navy
#0D47A1 panel on the left, form on the right).

Screen 1 — "Forgot your password?": one Email address field, a #2196F3 full-width button "Send
reset link", and a "Back to sign in" text link. Then show its submitted state: the form is
replaced by a card with a #E3F2FD circle containing a mail icon, the heading "Check your inbox",
and this exact body text — "If an account exists for that email, we've sent a link to reset the
password. The link expires in one hour." Important: this message is shown whether or not the
account exists, so it must not hint either way.

Screen 2 — "Choose a new password": New password and Confirm password fields, both with show/hide
toggles, plus a live requirements checklist under the first field (minimum length, one number, one
letter) where met items turn #16A34A with a check. Primary button "Reset password".

Also show screen 2's expired-link state: a card with a red #DC2626 alert icon, heading "This link
has expired", body "Reset links are valid for one hour.", and a #2196F3 button "Request a new
link".
```

### 5.4 Set password (invite acceptance)

```
STYLE: Smart Teacher admin console. Material-style SaaS admin, Inter. Sidebar #0D47A1 with white
text; canvas #F5F8FC; white cards, 1px #E2E8F0 border, 8px radius, subtle shadow. Primary #2196F3,
soft accent #90CAF9, tinted fills and selected rows #E3F2FD. Text #0F172A, muted #64748B. Status:
green #16A34A, amber #F59E0B, red #DC2626. 14px body, 12px uppercase table headers, pill badges,
48px table rows. Desktop web 1440px.

Design the account activation page for Smart Teacher. A teacher or student has been invited by
their school admin and clicked the link in their email; this is where they set their first
password. Same split layout as the sign-in page.

The form card greets them by name and school: heading "Welcome, Priya", subtext "Set a password to
activate your account at Oakridge Public School." Show the email address they were invited with as
read-only text in a #E3F2FD pill, not an editable field.

Fields: Create password, Confirm password, both with show/hide toggles and a strength meter under
the first — a 4-segment bar going #DC2626, #F59E0B, #90CAF9, #16A34A with a label of Weak / Fair /
Good / Strong. Primary #2196F3 button "Activate account".

Below the button, a 12px #64748B note: "Your school administrator can never see your password."
```

---

## 6. Super admin screens

### 6.1 Platform dashboard

```
STYLE: Smart Teacher admin console. Material-style SaaS admin, Inter. Sidebar #0D47A1 with white
text; canvas #F5F8FC; white cards, 1px #E2E8F0 border, 8px radius, subtle shadow. Primary #2196F3,
soft accent #90CAF9, tinted fills and selected rows #E3F2FD. Text #0F172A, muted #64748B. Status:
green #16A34A, amber #F59E0B, red #DC2626. 14px body, 12px uppercase table headers, pill badges,
48px table rows. Desktop web 1440px.

Design the platform super admin dashboard for Smart Teacher. Sidebar (Dashboard, Schools, Content
Library, Grade Levels & Subjects, Curriculum, School Entitlements, Platform Settings) with
Dashboard active.

Page header: "Welcome back, Vishwanth" with the grey description "Platform administration".

Row of four stat tiles: Schools 24 (building icon), Curricula 86 (tree icon), Videos 1,240 (play
icon), Documents 310 (file icon). Each is a white card with the number at 32px semibold, a 12px
uppercase #64748B label, and the icon in an #E3F2FD circle top-right. The whole tile is clickable
with a #90CAF9 border on hover.

Below, a two-thirds / one-third split:
- Left: a card titled "Recently added schools" listing five schools as rows — name in medium
  weight, monospace slug in #64748B underneath, a green "ACTIVE" or red "SUSPENDED" pill on the
  right, and a "View all schools" link in the card footer.
- Right: a card titled "Content pipeline" showing four counts as a compact vertical list with
  coloured dots — Ready (green #16A34A) 1,180, Processing (blue #2196F3) 12, Queued (amber
  #F59E0B) 40, Failed (red #DC2626) 8 — with "Failed" as a link.

Keep it calm and uncrowded. No charts, no revenue or engagement metrics.
```

### 6.2 Schools

```
STYLE: Smart Teacher admin console. Material-style SaaS admin, Inter. Sidebar #0D47A1 with white
text; canvas #F5F8FC; white cards, 1px #E2E8F0 border, 8px radius, subtle shadow. Primary #2196F3,
soft accent #90CAF9, tinted fills and selected rows #E3F2FD. Text #0F172A, muted #64748B. Status:
green #16A34A, amber #F59E0B, red #DC2626. 14px body, 12px uppercase table headers, pill badges,
48px table rows. Desktop web 1440px.

Design the "Schools" management screen for the Smart Teacher platform super admin. Sidebar with
Schools active.

Page header: title "Schools", description "Provision and manage tenant schools.", and a primary
#2196F3 button "New school" on the right.

Under it, a collapsible white card "Create a school" in its expanded state, with fields in a
3-column grid: School name, URL slug (monospace, with an inline hint "lowercase, no spaces"),
Academic year, Admin email, Admin name, and a Plan dropdown. Primary submit button "Create school"
bottom-right, ghost "Cancel" beside it.

Then a toolbar row: on the left a filter tab strip "All · Active · Suspended" with All active; on
the right a search field placeholdered "Search by name, slug, or admin email" and a ghost "Clear"
link.

Then the data table with columns: Name (medium weight, clickable), Slug (monospace 12px #64748B),
Admin email, Academic year, Status, Plan, and a right-aligned three-dot action menu. Status is a
pill — green #16A34A "ACTIVE" or red #DC2626 "SUSPENDED" — on a 12% tint of its own colour. Rows
48px, hover #E3F2FD. Show 6 rows, one of them suspended and greyed slightly.

Open the row action menu on one row showing: View entitlements, Edit details, Suspend school
(red). Table footer: "Page 1 of 3 · 24 total" on the left, Prev / Next buttons on the right.

Also show a confirm dialog for suspending: red warning icon, title "Suspend Oakridge Public
School?", body "Everyone at this school is signed out immediately and cannot sign back in.",
buttons Cancel and a red "Suspend school".
```

### 6.3 Content library

```
STYLE: Smart Teacher admin console. Material-style SaaS admin, Inter. Sidebar #0D47A1 with white
text; canvas #F5F8FC; white cards, 1px #E2E8F0 border, 8px radius, subtle shadow. Primary #2196F3,
soft accent #90CAF9, tinted fills and selected rows #E3F2FD. Text #0F172A, muted #64748B. Status:
green #16A34A, amber #F59E0B, red #DC2626. 14px body, 12px uppercase table headers, pill badges,
48px table rows. Desktop web 1440px.

Design the "Content Library" screen for the Smart Teacher platform super admin — where platform
videos and PDFs are uploaded and catalogued. Sidebar with Content Library active.

Page header: "Content Library", description "Find, inspect, and manage platform videos and PDF
documents."

Directly below: a segmented control with two options, "Videos" (selected, #0D47A1 fill, white
text) and "Documents", inside a white pill container.

Then an upload panel — a white card titled "Add a video" containing, left to right: a Curriculum
dropdown, a Content node dropdown (labelled "File under"), a Title field, and a dashed-border drop
zone reading "Drag an MP4 here or browse". Show one upload in progress inside the card: file name,
a #2196F3 progress bar at 64%, "64% · 128 MB of 200 MB", and a ghost Cancel.

Then a breadcrumb row: "All classes / Grade 5 / Mathematics", where the first two are #2196F3
links and the last is bold #0F172A, with a "← Back" link on the left.

Then a filter bar in a white card: a "Search titles" field, an "All statuses" dropdown, a #2196F3
"Apply filters" button, and a ghost "Clear".

Then the video table with columns Title, Filed under, Status, Size, plus a three-dot menu. Status
is a pill: READY green #16A34A, PROCESSING blue #2196F3, QUEUED amber #F59E0B, UPLOADING grey
#64748B, FAILED red #DC2626. Show 6 rows including one FAILED with a small red 12px reason line
under its title reading "ffmpeg exited with code 1". Footer "42 videos" with Previous / Next.

Below the table, a 12px #64748B caption: "Counts reflect the first 100 matching videos — narrow
your search for exact totals."
```

Follow-up prompt for the drill-down levels of the same screen:

```
Same Content Library screen, but show the two browse levels above the table.

Level 1 — no grade chosen: a 3-column grid of grade cards. Each card is white with a graduation-cap
icon in an #E3F2FD circle, the grade name in medium weight ("Grade 5"), and "18 videos" in #64748B
underneath. Hover lifts the card and turns its border #90CAF9.

Level 2 — a grade is chosen: the same grid but of subject cards, each with a book icon, subject
name ("Mathematics"), and its video count.

Level 3 is the video table already designed.

Also show the empty state used when no grade levels exist: centred graduation-cap icon in an
#E3F2FD circle, title "No grade levels yet", body "Grade levels are set up by a super admin before
videos can be catalogued.", and a #2196F3 button "Go to Grade Levels & Subjects".
```

### 6.4 Video detail

```
STYLE: Smart Teacher admin console. Material-style SaaS admin, Inter. Sidebar #0D47A1 with white
text; canvas #F5F8FC; white cards, 1px #E2E8F0 border, 8px radius, subtle shadow. Primary #2196F3,
soft accent #90CAF9, tinted fills and selected rows #E3F2FD. Text #0F172A, muted #64748B. Status:
green #16A34A, amber #F59E0B, red #DC2626. 14px body, 12px uppercase table headers, pill badges,
48px table rows. Desktop web 1440px.

Design the video detail screen in the Smart Teacher platform admin's Content Library.

A "← All videos" back link, then a page header with the video title "Adding Fractions with Unlike
Denominators" and the grey description "READY · created 12 Aug 2026, 14:22".

Below it, a 16:9 video player card with a poster frame, centred play button, and a control bar
with scrubber, time, volume, quality selector and fullscreen. Full width of the content column,
8px radius, dark player chrome.

Then a white card "Details" holding an editable metadata form: Title, Description (textarea),
Curriculum dropdown, Content node dropdown, and a right-aligned #2196F3 "Save changes" button with
a ghost "Discard" beside it.

Then a white card "Transcode output": a 3-column definition grid showing Duration 412 seconds,
Attempts 1, Source key, Playlist key and Poster key (the keys in monospace 12px, truncated with
ellipsis). Under it a compact table of renditions with columns Rendition, Dimensions, Bitrate, Key
— rows 1080p 1920×1080 5000 kbps, 720p 1280×720 2800 kbps, 480p 854×480 1400 kbps.

Finally a "Danger zone" card with a 1px #DC2626 border and a white body: two rows, each with a
label, an explanation line, and a right-aligned outlined red button — "Retry transcode" and
"Delete video". The delete row's explanation reads "3 schools are entitled to this content."

Also show the failed variant of this page: a red #DC2626 banner above the player reading "ffmpeg
exited with code 1", the player replaced by a grey placeholder, and the status in the header
showing FAILED.
```

### 6.5 Document detail

```
STYLE: Smart Teacher admin console. Material-style SaaS admin, Inter. Sidebar #0D47A1 with white
text; canvas #F5F8FC; white cards, 1px #E2E8F0 border, 8px radius, subtle shadow. Primary #2196F3,
soft accent #90CAF9, tinted fills and selected rows #E3F2FD. Text #0F172A, muted #64748B. Status:
green #16A34A, amber #F59E0B, red #DC2626. 14px body, 12px uppercase table headers, pill badges,
48px table rows. Desktop web 1440px.

Design the PDF document detail screen in the Smart Teacher platform admin's Content Library.

A "← All documents" back link, then a page header with the document title "Grade 5 Fractions
Worksheet" and the grey description "READY · 2.4 MB · created 12 Aug 2026".

Two-column layout below. Left column (60%): an embedded PDF preview in a white card with a thin
border, showing the first page, a page-count strip beneath it, and a #2196F3 outlined "Download
PDF" button above the preview.

Right column (40%), stacked cards:
1. "Details" — an editable form with Title, Description textarea, Curriculum dropdown, Content
   node dropdown, and a #2196F3 "Save changes" button.
2. "File" — definition rows for File size 2.4 MB, Pages 4, Uploaded 12 Aug 2026, Storage key in
   truncated monospace, plus a "Replace file" outlined button.
3. A "Danger zone" card with a 1px #DC2626 border containing a "Delete document" outlined red
   button and the explanation "3 schools are entitled to this content."
```

### 6.6 Grade levels and subjects

```
STYLE: Smart Teacher admin console. Material-style SaaS admin, Inter. Sidebar #0D47A1 with white
text; canvas #F5F8FC; white cards, 1px #E2E8F0 border, 8px radius, subtle shadow. Primary #2196F3,
soft accent #90CAF9, tinted fills and selected rows #E3F2FD. Text #0F172A, muted #64748B. Status:
green #16A34A, amber #F59E0B, red #DC2626. 14px body, 12px uppercase table headers, pill badges,
48px table rows. Desktop web 1440px.

Design the "Grade Levels & Subjects" taxonomy screen for the Smart Teacher platform super admin.
Sidebar with Grade Levels & Subjects active.

Page header: "Grade Levels & Subjects", description "Define the grade levels and subjects that
content and entitlements are organised by."

Two stacked sections, each a section heading followed by an inline create card and a table.

Section 1 — "Subjects". Create card with a Name field, a Code field (monospace, hint "short
uppercase code"), and a #2196F3 "Add subject" button, all on one row. Table columns: Name, Code
(monospace 12px #64748B), Status, and a three-dot menu. Status is a pill — green "ACTIVE" or red
"RETIRED". Show 6 rows including one retired row rendered at 60% opacity. The row menu on an
active row shows "Rename" and "Retire subject" (red); explain retirement in a 12px caption under
the table: "Retiring a subject blocks new entitlements. Existing grants keep working."

Section 2 — "Grade levels". Create card with a Name field, a Rank number field (hint "orders the
list"), and a #2196F3 "Add grade level" button. Table columns: Name, Rank, and a three-dot menu.
Show 6 rows in rank order, with a subtle drag handle on the left of each row to hint reordering.

Both tables get the empty state treatment too: "No subjects yet." and "No grade levels yet."
centred in the table body in #64748B.
```

### 6.7 Curriculum list

```
STYLE: Smart Teacher admin console. Material-style SaaS admin, Inter. Sidebar #0D47A1 with white
text; canvas #F5F8FC; white cards, 1px #E2E8F0 border, 8px radius, subtle shadow. Primary #2196F3,
soft accent #90CAF9, tinted fills and selected rows #E3F2FD. Text #0F172A, muted #64748B. Status:
green #16A34A, amber #F59E0B, red #DC2626. 14px body, 12px uppercase table headers, pill badges,
48px table rows. Desktop web 1440px.

Design the "Curriculum" screen for the Smart Teacher platform super admin. A curriculum is one
grade level + subject + audience, and its tree is what schools browse. Sidebar with Curriculum
active.

Page header: "Curriculum", description "One curriculum per grade level, subject, and audience. Its
tree is what schools browse, and what an entitlement grants."

Under the header, a single row: on the left the 14px #64748B note "Level names and depth come from
a schema, so the structure can differ from grade to grade and subject to subject."; on the right a
#2196F3 text link "Manage level schemas →".

Then a white "Create a curriculum" card with four dropdowns in a row — Grade level, Subject,
Audience (Students / Teachers), Level schema — and a #2196F3 "Create curriculum" button.

Then the data table with columns: Grade level (medium weight, clickable), Subject, Audience,
Structure, Nodes, Videos, Documents, Status. The numeric columns are right-aligned. Audience shows
as a soft chip — "Students" on #E3F2FD with #0D47A1 text, "Teachers" on a #90CAF9 tint. Status is
a pill: PUBLISHED green #16A34A, DRAFT amber #F59E0B, ARCHIVED grey #64748B. Show 8 rows across
several grades with a mix of statuses.

Show the empty state as an alternative: centred tree icon in an #E3F2FD circle, title "No curricula
yet", body "Create one above. Until a curriculum exists for a grade level and subject, no school
can be granted it and no video can be filed under it."
```

### 6.8 Curriculum schemas

```
STYLE: Smart Teacher admin console. Material-style SaaS admin, Inter. Sidebar #0D47A1 with white
text; canvas #F5F8FC; white cards, 1px #E2E8F0 border, 8px radius, subtle shadow. Primary #2196F3,
soft accent #90CAF9, tinted fills and selected rows #E3F2FD. Text #0F172A, muted #64748B. Status:
green #16A34A, amber #F59E0B, red #DC2626. 14px body, 12px uppercase table headers, pill badges,
48px table rows. Desktop web 1440px.

Design the "Curriculum schemas" screen for the Smart Teacher platform super admin. A schema defines
the names and depth of the levels below grade and subject — for example Unit → Chapter → Topic.

A "← Curriculum" back link, then a page header: "Curriculum schemas", description "Reusable names
and rules for every level below grade and subject."

Then a white "Create a schema" card: Name field, Code field (monospace), Description field, and
below them a level editor — an ordered list where each row has a drag handle, a depth number in an
#E3F2FD circle, a level-name text input, a "Can hold videos" toggle switch, and a red trash icon.
A ghost "+ Add level" button under the list, and a #2196F3 "Create schema" button bottom-right.

Then a stack of existing schema cards. Each white card shows: the schema name as an 18px heading,
its code in monospace 12px #64748B beneath, an optional description line, and "12 curricula" in
#64748B on the right. Under that, the levels as a horizontal row of chips reading "1. Unit",
"2. Chapter", "3. Topic · videos" — chips that can hold content get an #E3F2FD fill with a small
play icon, the others a plain #F5F8FC fill. A card footer with ghost "Edit" and red ghost "Delete"
buttons; Delete is disabled with a tooltip "In use by 12 curricula" when the count is above zero.

Show three schema cards with different depths to make the point that structures differ.
```

### 6.9 Curriculum builder (content tree)

```
STYLE: Smart Teacher admin console. Material-style SaaS admin, Inter. Sidebar #0D47A1 with white
text; canvas #F5F8FC; white cards, 1px #E2E8F0 border, 8px radius, subtle shadow. Primary #2196F3,
soft accent #90CAF9, tinted fills and selected rows #E3F2FD. Text #0F172A, muted #64748B. Status:
green #16A34A, amber #F59E0B, red #DC2626. 14px body, 12px uppercase table headers, pill badges,
48px table rows. Desktop web 1440px.

Design the curriculum builder screen for the Smart Teacher platform super admin — where the content
tree of one curriculum is authored. This is the most important screen in the product; give it real
care.

A "← Curriculum" back link, then a page header showing "Grade 5 · Mathematics" with the grey
description "Students · CBSE 3-level schema · 48 nodes · 120 videos". On the right of the header, a
status pill "DRAFT" in amber #F59E0B and a #2196F3 "Publish curriculum" button.

Below the header, a soft #E3F2FD banner with an info icon: "Draft curricula are not visible to any
school, even where an entitlement has been granted."

Main body is a two-column layout.

Left column (65%) — the content tree in a white card. Nested, expandable rows with 24px indents
and thin vertical guide lines. Level 1 rows ("Unit 1 · Numbers") are 16px medium with a chevron and
a folder icon; level 2 ("Chapter 1 · Place value") 14px; level 3 ("Topic · Rounding") 14px #64748B
with a play icon. Each row shows small right-aligned count chips — "6 videos", "2 docs" — and a
three-dot menu on hover with Add child, Rename, Move up, Move down, Delete. Show the tree with two
units expanded, one collapsed, and one row selected with an #E3F2FD fill and a 3px #2196F3 left
bar. A ghost "+ Add unit" button pinned at the bottom of the card.

Right column (35%) — a sticky "Edit node" panel: the node's level shown as a chip ("Chapter,
depth 2"), a Title field, a Description textarea, an ordering number field, and the list of content
filed under it as small rows with a play or file icon, title, and a red unlink icon. Buttons:
#2196F3 "Save node" and ghost "Cancel".

Also show the publish confirm dialog: title "Publish this curriculum?", body "3 schools are
entitled to it and will see this tree immediately.", buttons Cancel and #2196F3 "Publish".
```

### 6.10 Entitlements — school list

```
STYLE: Smart Teacher admin console. Material-style SaaS admin, Inter. Sidebar #0D47A1 with white
text; canvas #F5F8FC; white cards, 1px #E2E8F0 border, 8px radius, subtle shadow. Primary #2196F3,
soft accent #90CAF9, tinted fills and selected rows #E3F2FD. Text #0F172A, muted #64748B. Status:
green #16A34A, amber #F59E0B, red #DC2626. 14px body, 12px uppercase table headers, pill badges,
48px table rows. Desktop web 1440px.

Design the "School Entitlements" landing screen for the Smart Teacher platform super admin — the
list of schools you pick from before granting content. Sidebar with School Entitlements active.

Page header: "School Entitlements", description "Grant schools access to grade level and subject
content."

A search field above the list placeholdered "Search schools".

Then a 2-column grid of school cards. Each white card shows: the school name in 16px medium, its
monospace slug in #64748B beneath, a green "ACTIVE" or red "SUSPENDED" pill top-right, and a
divider. Below the divider, two inline counts with small icons — "18 student curricula" and
"6 teacher curricula" — plus a coverage bar: a thin 4px track in #E2E8F0 filled to about 40% in
#2196F3, captioned "24 of 60 curricula granted" in 12px #64748B. Card footer has a #2196F3 text
link "Manage entitlements →". Hovering a card turns its border #90CAF9.

Show 6 cards, including one school with zero grants where the counts read "No curricula granted"
in #64748B and the coverage bar is empty.
```

### 6.11 Entitlement matrix

```
STYLE: Smart Teacher admin console. Material-style SaaS admin, Inter. Sidebar #0D47A1 with white
text; canvas #F5F8FC; white cards, 1px #E2E8F0 border, 8px radius, subtle shadow. Primary #2196F3,
soft accent #90CAF9, tinted fills and selected rows #E3F2FD. Text #0F172A, muted #64748B. Status:
green #16A34A, amber #F59E0B, red #DC2626. 14px body, 12px uppercase table headers, pill badges,
48px table rows. Desktop web 1440px.

Design the entitlement grid screen for the Smart Teacher platform super admin — a grade level ×
subject matrix of checkboxes controlling which curricula one school can reach.

A "← All schools" back link, then a page header with the school name "Oakridge Public School" and
the grey description "Curricula this school can reach. A grant covers the whole tree beneath it."

Below it a segmented control with "Students" (selected) and "Teachers".

Then the matrix in a white card with horizontal scroll. The first column is sticky, headed "Grade
level" with a select-all checkbox beside the label; subject names are the column headers, centred,
12px uppercase #64748B. Each row is a grade level (Grade 1 through Grade 8) with a row-level
checkbox next to its name. Cells contain a single centred checkbox — checked ones filled #2196F3
with a white tick, row/column parents shown in an indeterminate dash state. Some cells instead show
a faint #E2E8F0 em-dash meaning no curriculum exists for that pair. Under a few checked cells, a
tiny 10px uppercase amber #F59E0B label "draft". A sticky footer row labelled "All grade levels"
holds a per-column select-all checkbox. Checked cells tint their whole cell #E3F2FD.

Under the card, a 12px #64748B caption: "A dash means no curriculum has been authored for that
grade level and subject yet — create one." with "create one" as a #2196F3 link.

Then a sticky action bar — a white card pinned above the bottom of the viewport — reading "6 to
grant · 2 to revoke" on the left, and on the right an outlined "Reset" button and a #2196F3 "Save
changes" button. Show a second version of that bar in its clean state reading "No unsaved changes"
with both buttons disabled at 50% opacity.

Also show the revoke confirm dialog: amber warning icon, title "Revoke 2 entitlements?", body
"Teachers and students lose that content immediately.", Cancel and a red "Revoke" button.
```

### 6.12 Platform settings

```
STYLE: Smart Teacher admin console. Material-style SaaS admin, Inter. Sidebar #0D47A1 with white
text; canvas #F5F8FC; white cards, 1px #E2E8F0 border, 8px radius, subtle shadow. Primary #2196F3,
soft accent #90CAF9, tinted fills and selected rows #E3F2FD. Text #0F172A, muted #64748B. Status:
green #16A34A, amber #F59E0B, red #DC2626. 14px body, 12px uppercase table headers, pill badges,
48px table rows. Desktop web 1440px.

Design the "Platform Settings" screen for the Smart Teacher super admin. Sidebar with Platform
Settings active.

Page header: "Platform Settings", description "Platform-wide configuration and preferences."

A left settings sub-navigation column (200px) with items General, Branding, Email, Video delivery,
Security — General active, styled as text items with the active one in #0D47A1 medium on an #E3F2FD
pill.

Right column, stacked white setting cards. Each card is a titled section with a one-line grey
description and its fields in a 2-column grid, plus a right-aligned #2196F3 "Save" button in the
card footer:
1. "General" — Platform name, Support email, Default academic year, Timezone dropdown.
2. "Branding" — a logo upload box showing a current logo thumbnail with Replace/Remove, and a
   read-only palette row showing the four brand swatches #E3F2FD #90CAF9 #2196F3 #0D47A1 as
   labelled circles.
3. "Email" — SMTP host, port, from-address, and a "Send test email" outlined button.
4. "Video delivery" — a radio group with two options presented as selectable cards, "API
   (local development)" and "Edge (Cloudflare + R2)", the selected one outlined #2196F3 with an
   #E3F2FD fill; plus a read-only "Playback token lifetime: 10 minutes" row.
5. "Security" — toggle switches for two-factor requirement and session revocation on password
   reset, each with a description line.

Separately, also design the placeholder version of this page for before it is built: centred
sliders icon in an #E3F2FD circle, title "Platform Settings", body "Platform-wide configuration and
preferences.", and an #E3F2FD pill reading "Coming soon".
```

---

## 7. School admin screens

### 7.1 School dashboard

```
STYLE: Smart Teacher admin console. Material-style SaaS admin, Inter. Sidebar #0D47A1 with white
text; canvas #F5F8FC; white cards, 1px #E2E8F0 border, 8px radius, subtle shadow. Primary #2196F3,
soft accent #90CAF9, tinted fills and selected rows #E3F2FD. Text #0F172A, muted #64748B. Status:
green #16A34A, amber #F59E0B, red #DC2626. 14px body, 12px uppercase table headers, pill badges,
48px table rows. Desktop web 1440px.

Design the school admin dashboard for Smart Teacher. Sidebar for a school admin (Dashboard,
Students, Teachers, Classes & Sections, Timetable, Library, Settings) with Dashboard active. The
top header shows the school name "Oakridge Public School".

Page header: "Welcome back, Priya" with the grey description "Oakridge Public School".

A responsive grid of five cards, three per row on desktop:
1. Students — 486, graduation-cap icon, clickable.
2. Teachers — 32, people icon, clickable.
3. Classes — 18, book icon, clickable, with a 12px #64748B hint line "Coming soon".
4. Pending invites — 12, mail-warning icon, hint "Accounts that haven't been activated yet". Give
   the number an amber #F59E0B accent since it is an action item.
5. Latest timetable — a card of the same size but different inside: the label "Latest timetable"
   with a calendar icon, then a #2196F3 link "Term 2 — week of 18 Aug".

Each stat tile is a white card: 12px uppercase #64748B label top-left, icon in an #E3F2FD circle
top-right, the number at 32px semibold #0F172A, and an optional hint line at the bottom. Hover
turns the border #90CAF9 and shows a small arrow.

Also show the empty variant of card 5: a large "—" in place of the link and the 12px #64748B line
"No timetable published yet".

Below the tiles, a full-width white card "Getting started" with three numbered steps as a
horizontal stepper — "Add your teachers", "Create classes & sections", "Import your students" —
each with a #2196F3 link, and completed steps marked with a green #16A34A check.
```

### 7.2 Students

```
STYLE: Smart Teacher admin console. Material-style SaaS admin, Inter. Sidebar #0D47A1 with white
text; canvas #F5F8FC; white cards, 1px #E2E8F0 border, 8px radius, subtle shadow. Primary #2196F3,
soft accent #90CAF9, tinted fills and selected rows #E3F2FD. Text #0F172A, muted #64748B. Status:
green #16A34A, amber #F59E0B, red #DC2626. 14px body, 12px uppercase table headers, pill badges,
48px table rows. Desktop web 1440px.

Design the "Students" screen for a Smart Teacher school admin. Sidebar with Students active.

Page header: "Students", description "Onboard students and manage their class placement.", with a
#2196F3 "Add student" button and an outlined "Import CSV" button on the right.

A collapsible white card "Add a student" in expanded state, fields in a 3-column grid: First name,
Last name, Email address, Section dropdown, Roll number (optional). Primary "Create student" button
bottom-right with a 12px #64748B note beside it: "An invite email is sent so they can set their own
password."

Then a toolbar: on the left a filter tab strip "All · Active · Pending · Disabled" with All active;
on the right a Section dropdown filter, a search field placeholdered "Search students", and a ghost
"Clear".

Then the data table, columns: Name (with a 32px circular initials avatar in #E3F2FD with #0D47A1
initials), Email, Section (as a soft #E3F2FD chip), Roll number, Status, Joined, and a right-aligned
three-dot menu. Status pills: green "ACTIVE", amber "PENDING", red "DISABLED". Show 8 rows with a
mix of statuses; the disabled row's name and email at 60% opacity.

Open one row menu showing: View profile, Change section, Resend invite, Disable account (red).

Table footer: "Page 1 of 25 · 486 total" with Prev / Next.

Also show the empty state: centred graduation-cap icon in an #E3F2FD circle, title "No students
yet", body "Add students one at a time, or import a CSV to onboard a whole class.", with #2196F3
"Add student" and outlined "Import CSV" buttons.
```

### 7.3 Bulk import flow

```
STYLE: Smart Teacher admin console. Material-style SaaS admin, Inter. Sidebar #0D47A1 with white
text; canvas #F5F8FC; white cards, 1px #E2E8F0 border, 8px radius, subtle shadow. Primary #2196F3,
soft accent #90CAF9, tinted fills and selected rows #E3F2FD. Text #0F172A, muted #64748B. Status:
green #16A34A, amber #F59E0B, red #DC2626. 14px body, 12px uppercase table headers, pill badges,
48px table rows. Desktop web 1440px.

Design the three steps of the CSV bulk-import flow used by a Smart Teacher school admin to onboard
students (the same flow is reused for teachers). Show all three as full page states with a step
indicator at the top: a 3-step horizontal stepper reading Upload → Review → Done, where the
current step is #2196F3, completed steps are #16A34A with a check, and upcoming steps are #E2E8F0.

Step 1 — Upload. A large dashed-border drop zone with an #E3F2FD upload icon circle, "Drag your CSV
here or browse", and a 12px #64748B line "Up to 2,000 rows · 5 MB". Beside it, a white card
"Expected columns" listing first_name, last_name, email, grade_level, section, roll_number and
password as monospace chips — the first three marked required with a small #DC2626 dot — plus a
#2196F3 "Download template" link and the note "Column order and casing don't matter."

Step 2 — Review. A summary strip of three counts as inline pills — "142 ready" green, "6 warnings"
amber, "3 errors" red. Then a preview table with columns Row, First name, Last name, Email, Grade
level, Section, Roll number, Result. The Row column shows the spreadsheet line number in monospace.
Each row is prefixed with a status icon; valid rows are plain, warning rows have an #FFFBEB tint
with an amber left bar, and error rows an #FEF2F2 tint with a red left bar and an inline red 12px
message in the Result column such as "Email already exists in this school" or "No section 'B' for
Grade 5". Footer bar: "142 of 151 rows will be imported" on the left, ghost "Back" and #2196F3
"Import students" on the right.

Step 3 — Done. A centred result card: a green #16A34A check in a circle, heading "142 students
imported", and four summary rows with counts — Created 142, Skipped 6, Invalid rows 3, Invite
emails sent 142 — each with its status colour, and a small amber line "2 invite emails failed to
send" where relevant. Below, a collapsed "View invalid rows" accordion listing each row number with
its error, a ghost "Download error report" link, and two buttons: #2196F3 "Go to students" and ghost
"Import another file".
```

### 7.4 Teachers

```
STYLE: Smart Teacher admin console. Material-style SaaS admin, Inter. Sidebar #0D47A1 with white
text; canvas #F5F8FC; white cards, 1px #E2E8F0 border, 8px radius, subtle shadow. Primary #2196F3,
soft accent #90CAF9, tinted fills and selected rows #E3F2FD. Text #0F172A, muted #64748B. Status:
green #16A34A, amber #F59E0B, red #DC2626. 14px body, 12px uppercase table headers, pill badges,
48px table rows. Desktop web 1440px.

Design the "Teachers" screen for a Smart Teacher school admin. Sidebar with Teachers active.

Page header: "Teachers", description "Onboard teaching staff one at a time or in bulk, and assign
the subjects they teach.", with a #2196F3 "Add teacher" button and an outlined "Import CSV" button.

A collapsible white "Add a teacher" card, expanded: Full name, Email address, and a
multi-select Subjects field rendered as removable #E3F2FD chips inside the input ("Mathematics ×",
"Science ×") with a "Create teacher" button.

Toolbar: filter tab strip "All · Active · Pending · Disabled", a Subject dropdown filter, a search
field, and a ghost "Clear".

Data table, columns: Name (with initials avatar), Email, Subjects (up to two soft #E3F2FD chips
plus a "+2" overflow chip), Classes (a count with a small book icon), Status pill, and a
right-aligned three-dot menu. Show 7 rows with a mix of statuses, including one PENDING row whose
Subjects cell reads "—" in #64748B.

Open a row menu showing: View profile, Manage assignments, Resend invite, Disable account (red).

Footer: "Page 1 of 2 · 32 total" with Prev / Next.

Also show the empty state: people icon in an #E3F2FD circle, title "No teachers yet", body "Add
your teaching staff, then assign them to classes and subjects."
```

### 7.5 Teacher detail

```
STYLE: Smart Teacher admin console. Material-style SaaS admin, Inter. Sidebar #0D47A1 with white
text; canvas #F5F8FC; white cards, 1px #E2E8F0 border, 8px radius, subtle shadow. Primary #2196F3,
soft accent #90CAF9, tinted fills and selected rows #E3F2FD. Text #0F172A, muted #64748B. Status:
green #16A34A, amber #F59E0B, red #DC2626. 14px body, 12px uppercase table headers, pill badges,
48px table rows. Desktop web 1440px.

Design the teacher profile screen for a Smart Teacher school admin, where teaching assignments are
managed.

A "← Teachers" back link, then a page header combining a 56px circular initials avatar in #E3F2FD
with #0D47A1 initials, the teacher's name "Anita Rao" as the title, and their email as the grey
description. On the right, a green "ACTIVE" pill and an outlined three-dot menu button.

Below, a 2/3 + 1/3 layout.

Left column — a white card "Teaching assignments". Each assignment is a row: the section as a
medium-weight label ("Grade 5 · Section A"), the subject beneath it in #64748B, an audience chip,
and a red ghost "Remove" on the right. Show four assignment rows, and one row where the section is
absent showing "School-wide" as a #90CAF9-tinted chip instead. Card footer holds a ghost
"+ Add assignment" button.

Right column, stacked cards:
1. "Add an assignment" — Section dropdown, Subject dropdown, and a #2196F3 "Assign" button
   full-width. A 12px #64748B note: "A teacher sees library content for every grade and subject
   they are assigned to."
2. "At a glance" — three definition rows: Classes 4, Subjects 2, Students reached 128.
3. "Account" — Invited 02 Aug 2026, Activated 03 Aug 2026, Last sign-in 16 Aug 2026, and an
   outlined "Resend invite" button.

Also show the left card's empty state: a book icon in an #E3F2FD circle, title "No assignments
yet", body "Assign this teacher to a section and subject using the form."
```

### 7.6 Classes and sections

```
STYLE: Smart Teacher admin console. Material-style SaaS admin, Inter. Sidebar #0D47A1 with white
text; canvas #F5F8FC; white cards, 1px #E2E8F0 border, 8px radius, subtle shadow. Primary #2196F3,
soft accent #90CAF9, tinted fills and selected rows #E3F2FD. Text #0F172A, muted #64748B. Status:
green #16A34A, amber #F59E0B, red #DC2626. 14px body, 12px uppercase table headers, pill badges,
48px table rows. Desktop web 1440px.

Design the "Classes & Sections" screen for a Smart Teacher school admin. Sidebar with Classes &
Sections active.

Page header: "Classes & Sections", description "View class sizes and the teachers assigned to each
section.", with a #2196F3 "New section" button.

A collapsible white "Create a section" card, expanded: a Grade level dropdown, a Section label
field (hint "A, B, Blue…"), and a "Create section" button on one row.

Then the data table with columns Class, Grade level, Students, Teachers. The Class cell is medium
weight ("Grade 5 · A"); Students is a #2196F3 link showing a count with a small people icon;
Teachers is a row of chips, each a 24px initials avatar plus the teacher name on an #E3F2FD fill,
with a "+2" overflow chip where there are more than three. Show 8 rows across several grades, one
of them with zero students where the count reads "0" in #64748B.

Under the table, a section headed "School-wide teaching assignments" with the 14px #64748B
description "Assignments not yet linked to a specific section.", and a white card containing a
wrapped row of the same teacher chips, each with the subject appended in smaller text.

Also show the empty state: book icon in an #E3F2FD circle, title "No classes yet", body "Create a
section to start placing students and assigning teachers.", #2196F3 button "Create a section".
```

### 7.7 Timetable

```
STYLE: Smart Teacher admin console. Material-style SaaS admin, Inter. Sidebar #0D47A1 with white
text; canvas #F5F8FC; white cards, 1px #E2E8F0 border, 8px radius, subtle shadow. Primary #2196F3,
soft accent #90CAF9, tinted fills and selected rows #E3F2FD. Text #0F172A, muted #64748B. Status:
green #16A34A, amber #F59E0B, red #DC2626. 14px body, 12px uppercase table headers, pill badges,
48px table rows. Desktop web 1440px.

Design two versions of the "Timetable" screen for a Smart Teacher school admin. Sidebar with
Timetable active.

Version 1 — the placeholder shown before the feature ships: a centred card on the canvas with a
calendar icon in a 64px #E3F2FD circle, the title "Timetable", the grey body "Build and publish the
weekly schedule for every class.", and an #E3F2FD pill reading "Coming soon". Keep it generous and
calm, not an error state.

Version 2 — the real screen concept. Page header "Timetable" with a Class dropdown ("Grade 5 · A"),
a week selector with left/right chevrons showing "18–22 Aug 2026", and a #2196F3 "Publish" button.
Below, a weekly grid: time slots down the left in 12px #64748B (08:00 to 15:00), days Monday to
Friday across the top as 12px uppercase headers. Lesson blocks fill cells as rounded 6px cards
tinted per subject using #E3F2FD, #90CAF9 and light neutrals, each showing the subject in medium
weight, the teacher name in 12px, and the room in 12px #64748B. Show a couple of empty slots as
dashed #E2E8F0 outlines with a faint "+" to hint that they are droppable, one double-height block
spanning two periods, and a break row spanning the full width in a flat #F5F8FC band labelled
"Lunch".
```

### 7.8 Library (school-side browse)

```
STYLE: Smart Teacher admin console. Material-style SaaS admin, Inter. Sidebar #0D47A1 with white
text; canvas #F5F8FC; white cards, 1px #E2E8F0 border, 8px radius, subtle shadow. Primary #2196F3,
soft accent #90CAF9, tinted fills and selected rows #E3F2FD. Text #0F172A, muted #64748B. Status:
green #16A34A, amber #F59E0B, red #DC2626. 14px body, 12px uppercase table headers, pill badges,
48px table rows. Desktop web 1440px.

Design the "Library" screen a Smart Teacher school admin or teacher uses to browse the video and
PDF content their school is licensed for. Sidebar with Library active.

Page header: "Grade 5" with the grey description "Oakridge Public School". A segmented control
below it with "Students" (selected) and "Teachers", labelled by a small 12px #64748B caption
"Audience".

Then a grade selector row: horizontally scrollable pill chips "Grade 1 … Grade 8", the selected one
filled #0D47A1 with white text, the rest white with #E2E8F0 borders.

Then a 3-column grid of subject cards. Each is a white card with an 8px radius: a 40px subject icon
in an #E3F2FD circle, the subject name in 16px medium, a #64748B line "24 videos · 6 documents",
and a thin progress-style bar in #90CAF9 at the bottom. Hover raises the card and turns the border
#90CAF9. Show 6 subject cards.

Also show the unentitled empty state: a book icon in an #E3F2FD circle, title "No curricula yet",
body "No published curriculum is available to you. Ask your school administrator once your class is
set up." — no action button, since the viewer cannot fix it themselves.
```

### 7.9 Curriculum browse, video player, PDF viewer

```
STYLE: Smart Teacher admin console. Material-style SaaS admin, Inter. Sidebar #0D47A1 with white
text; canvas #F5F8FC; white cards, 1px #E2E8F0 border, 8px radius, subtle shadow. Primary #2196F3,
soft accent #90CAF9, tinted fills and selected rows #E3F2FD. Text #0F172A, muted #64748B. Status:
green #16A34A, amber #F59E0B, red #DC2626. 14px body, 12px uppercase table headers, pill badges,
48px table rows. Desktop web 1440px.

Design three linked content screens for a Smart Teacher school user.

Screen 1 — curriculum browse. A "← Library" back link, page header "Mathematics" with the grey
description "Grade 5 · 24 videos · 6 documents". Below it, the curriculum tree as a stack of white
accordion cards: each unit card shows "Unit 1 · Numbers" in 16px medium with a chevron and a
#64748B count on the right. One card is expanded, revealing chapter sub-headings and, under them,
content rows — each row a 96×54 video thumbnail with a duration badge in its corner, the title in
medium weight, a #64748B line "Topic · Rounding", and a play icon on the right. PDF rows use a red
file icon in place of the thumbnail and show the file size. Rows already watched get a thin
#16A34A left bar and a small check.

Screen 2 — video player page. A "← Curriculum" back link, then a 16:9 player filling the content
column with dark chrome, a #2196F3 progress scrubber, play/pause, volume, a quality selector, a
speed control and fullscreen. Under the player: the video title as a 24px heading, a breadcrumb
line "Mathematics · Unit 1 · Chapter 1" in #64748B, and a description paragraph. To the right, a
sticky 320px "Up next" list of sibling videos as compact thumbnail rows, the current one marked
with an #E3F2FD fill and a #2196F3 left bar.
Also show this page's session-expired state: the player replaced by a dark panel with a lock icon,
the message "Your viewing session expired", and a #2196F3 "Reload video" button.

Screen 3 — PDF viewer page. A "← Curriculum" back link, the document title as the page heading with
its content node as the grey description, a #2196F3 "Download PDF" button on the right, and below
them the PDF rendered full-width in a bordered white frame about 75% of viewport height, with a
page navigation strip beneath it.
```

### 7.10 School settings

```
STYLE: Smart Teacher admin console. Material-style SaaS admin, Inter. Sidebar #0D47A1 with white
text; canvas #F5F8FC; white cards, 1px #E2E8F0 border, 8px radius, subtle shadow. Primary #2196F3,
soft accent #90CAF9, tinted fills and selected rows #E3F2FD. Text #0F172A, muted #64748B. Status:
green #16A34A, amber #F59E0B, red #DC2626. 14px body, 12px uppercase table headers, pill badges,
48px table rows. Desktop web 1440px.

Design the "Settings" screen for a Smart Teacher school admin. Sidebar with Settings active.

Page header: "Settings", description "Academic year, branding, and other school-wide preferences."

A left settings sub-navigation (200px): School profile, Academic year, Branding, People, Danger
zone — School profile active, shown as an #E3F2FD pill with #0D47A1 medium text.

Right column of stacked white cards, each with a title, a one-line grey description, a 2-column
field grid, and a right-aligned #2196F3 "Save" button in its footer:
1. "School profile" — School name, monospace URL slug shown read-only with a lock icon and the
   hint "Contact platform support to change this", Contact email, Phone, Address textarea.
2. "Academic year" — Current academic year dropdown, Term start and Term end date pickers, and an
   #E3F2FD info strip: "Changing the academic year does not move students between grades."
3. "Branding" — a school logo upload box with a thumbnail and Replace/Remove, and an accent colour
   picker showing the four brand swatches #E3F2FD #90CAF9 #2196F3 #0D47A1.
4. "People" — read-only counts of Students 486, Teachers 32, Admins 3, each with a #2196F3 "Manage"
   link.
5. "Danger zone" — a card with a 1px #DC2626 border containing one row: "Archive this school year"
   with an explanation line and an outlined red button.

Separately, also design the placeholder version shown before this is built: centred settings-sliders
icon in an #E3F2FD circle, title "Settings", body "Academic year, branding, and other school-wide
preferences.", and an #E3F2FD "Coming soon" pill.
```

---

## 8. Cross-cutting state prompts

Run these once each, after the main screens exist, so Stitch derives them from the established
system rather than inventing a second one.

**Empty states**

```
Using the same design system, design a set of six empty states as a single sheet: no schools, no
students, no teachers, no classes, no curricula, no search results. Each is a centred block — a
32px icon in a 64px #E3F2FD circle, a 16px semibold #0F172A title, a 14px #64748B body of at most
two lines, and a #2196F3 primary button (except "no search results", which gets a ghost "Clear
filters" instead). They must sit inside the same white bordered card as the table they replace, so
the page does not shift.
```

**Loading skeletons**

```
Using the same design system, design loading skeletons for: a stat tile row, a data table (header
plus six rows), a card grid, and a detail page with a form. Use flat #E2E8F0 blocks with 6px radii
and a subtle left-to-right shimmer, matching the exact heights and column widths of the real
content so nothing jumps when it loads. No spinners anywhere.
```

**Feedback and dialogs**

```
Using the same design system, design a feedback sheet: success, error, warning and info toasts
(white card, coloured 4px left bar, icon, title, one body line, close button, bottom-right stacked);
a destructive confirm dialog (red icon circle, title, body naming the consequence, Cancel and a red
primary); a non-destructive confirm dialog (blue variant); an inline form error (red field outline,
12px red message under the field); and a page-level error banner.
```

**Error pages**

```
Using the same design system, design 404 and 403 pages inside the app shell — the sidebar and header
stay, only the content area changes. 404: a large 96px #90CAF9 numeral, title "Page not found", body
"The page you're looking for doesn't exist or has moved.", buttons #2196F3 "Back to dashboard" and
ghost "Go back". 403: the same layout with a lock icon, title "You don't have access to this",
body "Ask your administrator if you think this is a mistake." Keep both calm — no illustrations of
broken robots.
```

**Mobile**

```
Using the same design system, show the mobile layouts at 390px for: the dashboard, one table screen
(Students), and one detail screen (teacher profile). Tables become stacked cards — each card shows
the primary label as its heading, two or three secondary fields as label/value rows, a status pill
top-right, and a three-dot menu. Filters collapse into a single "Filters" button opening a bottom
sheet. Navigation is a fixed bottom tab bar of five items plus a "More" sheet. Sticky action bars
sit above the tab bar, not under it.
```

---

## 9. Code-handoff prompts

Once a screen is approved in Stitch, use these with Claude Code. **Run the first one before any
screen work** — it creates the primitives every later prompt composes from, so the per-screen work
is composition, not restyling.

**9.1 Primitives (run first)**

```
Apply the approved design system to apps/web. First, add the Tailwind token block and globals.css
variables from docs/2026-08-17-stitch-design-prompts.md §3. Then build the shared primitives in
apps/web/src/components/ui/ as server components unless they need state: button.tsx, card.tsx,
badge.tsx (status variants keyed to the real enums — SchoolStatus, UserStatus, VideoStatus,
CurriculumStatus, SubjectStatus), table.tsx (table shell, header, row, cell, empty row),
filter-tabs.tsx, pagination.tsx, search-field.tsx, and drawer.tsx. Restyle the existing
page-header.tsx, stat-tile.tsx, empty-state.tsx, skeleton.tsx, list-skeleton.tsx and coming-soon.tsx
to the new tokens without changing their props. Then update components/shell/ — app-sidebar.tsx,
sidebar-nav-link.tsx, app-header.tsx, mobile-nav.tsx — to the navy sidebar treatment. Do not change
any data fetching, any page's props, or lib/nav.ts. Run npm run lint and npm run build when done.
```

**9.2 Per-screen template**

```
Restyle <ROUTE> to the approved design. The page is apps/web/src/app/dashboard/<route>/page.tsx
with its _components/ folder. Compose the primitives from components/ui/ rather than hand-writing
border/bg/shadow classes, and promote any component this is the second use of into components/ui/.
Keep it a server component; keep all fetching in lib/api-client.ts; keep the existing role gate via
canRoleAccess and the redirect. Do not add fields the API does not return, and do not change any
DTO. Update loading.tsx so its skeleton matches the new layout's real dimensions. Run npm run lint
and npm run build.
```

Suggested order, so shared pieces settle before the fiddly screens:

1. `/dashboard` (both roles) — proves the tokens and stat tiles.
2. `/dashboard/schools` — establishes the table + filter + pagination pattern.
3. `/dashboard/students`, `/dashboard/teachers`, `/dashboard/classes` — reuse it.
4. `/dashboard/taxonomy`, `/dashboard/curriculum`, `/dashboard/curriculum/schemas`.
5. `/dashboard/content-library` and its two detail pages.
6. `/dashboard/entitlements` and the matrix (its own client component — restyle in place).
7. `/dashboard/curriculum/[id]` tree editor.
8. `/dashboard/videos` and the player/viewer leaves.
9. The three `ComingSoon` stubs — `/dashboard/timetable`, `/dashboard/settings`,
   `/dashboard/platform-settings`.
10. Auth pages: `/login`, `/forgot-password`, `/reset-password`, `/set-password`.

**9.3 Guardrails for every handoff**

- No new dependency without saying why first — the shell is plain Tailwind today.
- `'use client'` stays as narrow as it is now; do not convert a server page to a client page for
  styling.
- Status colours come from the `status.*` tokens, never inline hex.
- Every route keeps its `@Roles` behaviour on the API side untouched; this is a styling pass only.
- `npm run lint` and `npm run build` pass before the change is considered done.

---

## 10. Designed ahead of the API — read before handoff

Most prompts describe only what the pages already render. These few deliberately design forward,
because the screens are thin or stubbed today. Design them now, but **do not let §9 build them until
the endpoint exists** — otherwise you get placeholder numbers in production:

| Prompt | Asks for | Status today |
| --- | --- | --- |
| §6.1 platform dashboard | Curricula / Videos / Documents tiles, "Recently added schools", "Content pipeline" counts | only the Schools total exists (`apiListSchools` meta). Needs a platform stats endpoint alongside `stats.controller.ts` |
| §6.10 entitlements list | per-school grant counts and coverage bar | grants are fetched per school; an aggregate would be new |
| §7.1 school dashboard | "Getting started" stepper | derivable client-side from the existing `stats` counts — safe |
| §7.4 teachers table | Classes count column | derivable from teacher assignments — safe |
| §7.5 teacher detail | "Students reached" | needs computing from assignments + enrolments |
| §7.9 library | watched / progress marks on content rows | **no progress tracking model exists at all** — treat as a future feature, not a styling gap |
| §6.12, §7.7, §7.10 | the real Platform Settings, Timetable and School Settings screens | all three are `ComingSoon` stubs; only their placeholder versions are implementable today |

## 11. Not in this pass

Teacher-specific and student-specific screens (the student subject grid, the teacher's class view)
get their own document once these two roles are settled. The `Library` and player screens in §7.8
and §7.9 are shared with those roles, so they are already covered.
