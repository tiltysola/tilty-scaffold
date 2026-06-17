# tilty-scaffold

Full-stack application scaffold with a Vite React frontend and a Koa TypeScript
backend. The scaffold includes local authentication, optional OIDC SSO
authentication with first-time account binding, and optional SMTP-backed
registration email verification, password recovery, and RBAC-based access
control.

## Workspaces

| Directory   | Stack                                                               |
| ----------- | ------------------------------------------------------------------- |
| `frontend/` | Vite, React, React Router, Tailwind CSS, shadcn/ui                  |
| `backend/`  | Koa, Sequelize, migrations, scheduled jobs, Swagger UI              |
| `shared/`   | Runtime-neutral TypeScript utilities shared by frontend and backend |

## Setup

Use Node.js 22 for parity with CI.

```bash
npm install
cp backend/.env.example backend/.env
npm run build:shared
npm run db:migrate
npm run dev
```

Frontend runs on `http://localhost:8011`. Backend defaults to
`http://localhost:3000`; Swagger UI is available at `/api/docs`.

Copy `frontend/.env.example` to `frontend/.env` only when the frontend should
call a different backend URL.

## Commands

| Command                    | Description                            |
| -------------------------- | -------------------------------------- |
| `npm run dev`              | Start both workspaces                  |
| `npm run test`             | Run all tests                          |
| `npm run typecheck`        | Typecheck all workspaces               |
| `npm run lint`             | Lint backend and frontend              |
| `npm run format`           | Format repository files with Prettier  |
| `npm run format:check`     | Check repository formatting            |
| `npm run fix`              | Format files and fix lint violations   |
| `npm run build`            | Build all workspaces                   |
| `npm run build:shared`     | Build shared runtime-neutral utilities |
| `npm run clean`            | Remove generated build output          |
| `npm run preview:frontend` | Preview the frontend production build  |
| `npm run start:backend`    | Start the compiled backend server      |
| `npm run db:migrate`       | Apply backend migrations               |
| `npm run db:rollback`      | Roll back the latest backend migration |
| `npm run db:status`        | Show backend migration status          |

Workspace-specific commands are documented in `frontend/README.md`,
`backend/README.md`, and `shared/README.md`.

## Cross-Workspace Contracts

Authentication and account flows are coordinated by the backend and frontend.
The backend stores access and refresh tokens in HttpOnly cookies and returns
session metadata. The frontend discovers public authentication, SSO, and email
verification settings from backend endpoints and keeps only user and expiration
metadata for UI state.

Access control is shared across all workspaces. Built-in permission keys live in
`shared/`; the backend synchronizes and enforces RBAC; the frontend uses the
authenticated user's roles and permissions from `/api/auth/me` for navigation
and route access. Backend synchronization and schema details are documented in
`backend/README.md`.

Runtime-neutral contracts and helpers belong in `shared/`, including
access-control keys, safe path helpers, and validation helpers. Browser-only
behavior belongs in `frontend/`, and server-only behavior belongs in
`backend/`.

## Generated and Local Files

Generated build output is written to `dist/` directories and should be recreated
with package build commands. Do not edit generated output manually.

Backend local runtime data is written under `backend/data/` and backend local
logs are written under `backend/logs/`. These directories are local development
state and are not part of the scaffold source.

Generated shadcn/ui files live under `frontend/src/shadcn/`. Add or update those
files through the official shadcn CLI.

## CI

GitHub Actions runs install, test, typecheck, lint, and build on pull requests
and pushes to `main`.
