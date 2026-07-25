# smart-teacher

Production-grade boilerplate for the Smart Teacher platform: a NestJS + PostgreSQL/Prisma REST API with custom JWT auth and role-based access control, and a Next.js admin dashboard shell. This is scaffolding only — no domain features (schools/classes/enrollments/timetables) are implemented yet.

## Stack

- **API** (`apps/api`): NestJS, PostgreSQL, Prisma, Passport (local + JWT strategies), class-validator, Swagger.
- **Web** (`apps/web`): Next.js (App Router), TypeScript, Tailwind CSS.
- **Monorepo**: npm workspaces + Turborepo.
- **Shared**: `packages/shared-types` (Role enum, shared interfaces), `packages/tsconfig` (base TS configs).

## Prerequisites

- Docker (runs Postgres, and optionally the api/web apps themselves)
- Node.js 22 (see `.nvmrc`) — only needed for the local dev workflow, or to run migrations/seed against the Docker setup

## Option A: Run everything in Docker

Postgres, the API, and the web app all run as containers. Simplest way to see the whole thing working.

```bash
cp .env.example .env
docker compose up -d --build
```

The `api` container runs `prisma migrate deploy` automatically on startup, so the schema is created for you. Seed data still needs the Prisma CLI (a dev dependency, not shipped in the production image), so seed from the host once dependencies are installed:

```bash
npm install
cp apps/api/.env.example apps/api/.env   # DATABASE_URL here should point at localhost:5432
npm run db:seed
```

- API: http://localhost:4000 (Swagger docs at `/api/docs`, health check at `/health`)
- Web: http://localhost:3000

Rebuild after code changes with `docker compose up -d --build`. Stop everything with `docker compose down` (add `-v` to also wipe the Postgres volume).

## Option B: Local dev (hot reload)

Faster iteration loop — only Postgres runs in Docker, api/web run natively via Turborepo with watch mode.

```bash
# 1. Start Postgres
cp .env.example .env
docker compose up -d postgres

# 2. Install dependencies (installs all workspaces, generates Prisma client via postinstall)
npm install

# 3. Configure app env files
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# 4. Run migrations and seed data
npm run db:migrate
npm run db:seed

# 5. Start both apps
npm run dev
```

- API: http://localhost:4000 (Swagger docs at `/api/docs`, health check at `/health`)
- Web: http://localhost:3000

## Seeded accounts

| Email | Password | Role |
| --- | --- | --- |
| admin@smartteacher.dev | Passw0rd! | ADMIN |
| teacher@smartteacher.dev | Passw0rd! | TEACHER |

Log in at `/login` on the web app. The dashboard shows the current user's name and role. `GET /admin/users` on the API demonstrates RBAC: it returns data for the ADMIN account and a 403 for the TEACHER account.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Run api + web in dev mode (via Turborepo) |
| `npm run build` | Build all apps |
| `npm run lint` | Lint all apps |
| `npm run test:e2e` | Run the API's e2e auth/RBAC smoke test |
| `npm run db:migrate` | Apply Prisma migrations |
| `npm run db:seed` | Seed the ADMIN/TEACHER test users |
| `npm run docker:up` / `docker:down` | Start/stop the full Docker stack (Postgres + api + web) |
| `docker compose up -d --build` | Rebuild images and start the full stack |
| `docker compose up -d postgres` | Start Postgres only (for the local dev workflow) |

## Out of scope

Full CRUD for schools/classes/enrollments/timetables, real onboarding flows, CI/CD, production deployment config, secrets management, password reset/MFA, rate limiting, and an observability stack are intentionally not part of this boilerplate.
