# tilty-scaffold

Full-stack application scaffold with a Vite React frontend and a Koa TypeScript
backend. The scaffold includes local authentication, optional OIDC SSO
authentication with first-time account binding, and optional SMTP-backed
registration email verification, password recovery, Aliyun SMS profile
validation, RBAC-based access control, and a public landing page for
introducing the deployed system before sign-in.

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
npm run dev
```

`npm install` installs workspace dependencies and builds the `shared/` package
output.

Frontend runs on `http://localhost:8011`. The root route `/` serves the public
landing page without authentication, and the authenticated console starts at
`/dashboard`. Complete `/setup` to write `config.toml`, apply migrations, and
seed built-in access control. Backend defaults to `http://localhost:3000`;
Swagger UI is available at `/api/docs`.

After setup, runtime configuration is managed from System Settings. That page
is available only to `ROOT` users with a configured passkey or authenticator app
and requires step-up verification before configuration is shown or saved.

For production, run `npm run build` and `npm start`. The backend serves the
compiled frontend files from `dist/frontend` and starts from `dist/backend`.

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
| `npm start`                | Start the compiled full-stack server   |
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
verification settings from backend endpoints. Persistent browser storage keeps
only token-expiration metadata; authenticated user state is refreshed from
`/api/users/me`.

Access control is shared across all workspaces. Built-in permission keys live in
`shared/`; the backend synchronizes and enforces RBAC; the frontend uses the
authenticated user's roles and permissions from `/api/users/me` for navigation
and route access. Backend synchronization and schema details are documented in
`backend/README.md`.

The frontend exposes a shared theme mode control on the public landing page and
inside the authenticated console. Theme modes support Auto, Light, and Dark;
Auto follows the authenticated user's profile background theme when available
and otherwise follows the operating system preference.

Runtime-neutral contracts and helpers belong in `shared/`, including
access-control keys, safe path helpers, locale negotiation helpers, and
validation helpers. Browser-only behavior belongs in `frontend/`, and
server-only behavior belongs in `backend/`.

Internationalization supports `en-US` and `zh-CN`. The frontend owns React Intl
catalogs under `frontend/src/i18n/messages/` and sends `X-Tilty-Locale` on API
requests. The backend uses that locale for server-generated user-facing text,
including API error messages, setup gate responses, readiness failures, RBAC
display names, and email verification templates. API errors remain code-first
contracts; clients should localize known error codes and treat backend messages
as display fallbacks.

## Generated and Local Files

Generated backend and frontend build output is written under root `dist/` and
should be recreated with package build commands. Do not edit generated output
manually.

Backend local runtime data is written under root `data/` and backend local logs
are written under root `logs/`. These directories are local development state
and are not part of the scaffold source.

Generated shadcn/ui files live under `frontend/src/shadcn/`. Add or update those
files through the official shadcn CLI.

## CI

GitHub Actions runs install, test, typecheck, lint, and build on pull requests
and pushes to `main`.
