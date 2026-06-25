# tilty-scaffold/frontend

Vite React frontend scaffold with React Router, Tailwind CSS, shadcn/ui,
authentication, registration, password recovery, optional SSO authentication,
protected dashboard, and permission-gated user administration page.

## Commands

Install dependencies from the repository root.
Run commands from `frontend/`.

| Command                | Description                          |
| ---------------------- | ------------------------------------ |
| `npm run dev`          | Start development server             |
| `npm run test`         | Run frontend tests                   |
| `npm run typecheck`    | Run TypeScript checks                |
| `npm run build`        | Build production assets              |
| `npm run preview`      | Preview production build             |
| `npm run lint`         | Run ESLint                           |
| `npm run format`       | Format frontend files with Prettier  |
| `npm run format:check` | Check frontend formatting            |
| `npm run fix`          | Format files and fix lint violations |
| `npm run clean`        | Remove production build output       |

## Environment

The frontend uses relative API paths. During development, Vite proxies `/api`
and `/uploads` to `http://localhost:3000`.

## Backend Integration

Setup routing is controlled by the backend. While setup is required, browser
navigation redirects to `/setup`, and non-setup API requests return
`SETUP_REQUIRED`. After setup completes, non-setup API requests return
`SETUP_RESTART_REQUIRED` until restart, and direct `/setup` visits return to
`/login`. Backend setup lock configuration is documented in `backend/README.md`.

The setup page applies migrations through `/api/setup/*`. Database, Redis
cache, OSS storage, SLS logging, SMTP email, Aliyun SMS, and SSO must pass
connection tests when enabled. The database step detects available users; setup
creates the root administrator only when none exist. Existing users are
retained. Configuration without a network dependency is validated for required
values and URL or email format. The application domain defaults to the current
frontend origin, and CORS origins default to that domain.

Access and refresh tokens are stored by the backend in HttpOnly cookies and are
not stored from API response bodies. localStorage keeps only token-expiration
metadata. User state is refreshed from `/api/auth/me`, and stored session
metadata is cleared when the frontend cannot validate it with the backend.

Authenticated user metadata includes role and permission keys. The dashboard
displays authenticated user context and application status. The sidebar and
protected routes use role and permission keys for navigation and page access;
the backend remains the source of truth for API authorization.

The profile page updates the current user's avatar through
`/api/auth/avatar`, display name through `PATCH /api/auth/me`, and unverified
email status through `/api/auth/me/email-verification` and
`/api/auth/me/email-verification/confirm`. Phone binding uses
`/api/auth/me/phone-verification` and
`/api/auth/me/phone-verification/confirm` when SMS verification is configured.

The registration page reads `/api/auth/config` and shows email verification
only when the backend requires it. The login page reads `/api/auth/sso/config`
and shows configured SSO provider buttons for providers with login enabled. SSO
start requests use `/api/auth/sso/start` with an optional `providerId`. SSO
callback tokens are delivered in the `/sso/callback` URL fragment and consumed
by the SSO callback page.

The password recovery page reads `/api/auth/config`; when SMTP-backed email is
not enabled, it instructs the user to contact the site administrator.

First-time SSO identities complete account creation or existing-account binding
on the login page. The profile page reads `/api/auth/sso/identities` and can
start profile provider binding through `/api/auth/sso/bind/start`.

The users page calls `/api/users/` and is available only when the current user
has `USER_LIST` or `ROOT`. Users with `USER_ADMIN` or `ROOT` can update managed
user profile fields, password, account status, and role assignments through
`/api/users/:id`.

## Routes

| Route              | Page                 |
| ------------------ | -------------------- |
| `/`                | Dashboard            |
| `/dashboard`       | Dashboard            |
| `/users`           | Users                |
| `/profile`         | Profile              |
| `/setup`           | Setup                |
| `/login`           | Log in               |
| `/sso/callback`    | SSO callback         |
| `/forgot-password` | Password recovery    |
| `/register`        | Account registration |
| `*`                | Not found            |

## Components

Application components live in `src/components/`, page components live under
`src/pages/`, and generated shadcn/ui files stay in `src/shadcn/`. The full
shadcn/ui component set is installed under `src/shadcn/components/ui/`. Project
page and component files should name their default export component `Index`;
generated shadcn/ui files keep their generated names. Add or update shadcn/ui
components through the official CLI:

```bash
npx shadcn@latest add <component>
```

Production output is written to `dist/` and should be recreated with
`npm run build`. Generated shadcn/ui files should be changed only through the
official CLI.
