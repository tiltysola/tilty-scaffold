# tilty-scaffold

Full-stack application scaffold with a Vite React frontend and a Koa TypeScript
backend. The scaffold includes local authentication, optional OIDC SSO
authentication with first-time account binding, and optional SMTP-backed
registration email verification and password recovery.

## Workspaces

| Directory | Stack |
|-----------|-------|
| `frontend/` | Vite, React, React Router, Tailwind CSS, shadcn/ui |
| `backend/` | Koa, Sequelize, migrations, scheduled jobs, Swagger UI |

## Setup

Use Node.js 22 for parity with CI.

```bash
npm install
cp backend/.env.example backend/.env
npm run db:migrate
npm run dev
```

Frontend runs on `http://localhost:8011`. Backend defaults to
`http://localhost:3000`; Swagger UI is available at `/api/docs`.

Copy `frontend/.env.example` to `frontend/.env` only when the frontend should
call a different backend URL.

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both workspaces |
| `npm run test` | Run all tests |
| `npm run typecheck` | Typecheck all workspaces |
| `npm run lint` | Lint frontend |
| `npm run fix` | Format frontend code and fix lint violations |
| `npm run build` | Build all workspaces |
| `npm run clean` | Remove generated build output |
| `npm run preview:frontend` | Preview the frontend production build |
| `npm run start:backend` | Start the compiled backend server |
| `npm run db:migrate` | Apply backend migrations |
| `npm run db:rollback` | Roll back the latest backend migration |
| `npm run db:status` | Show backend migration status |

Workspace-specific commands are documented in `frontend/README.md` and
`backend/README.md`.

## CI

GitHub Actions runs install, test, typecheck, lint, and build on pull requests
and pushes to `main`.
