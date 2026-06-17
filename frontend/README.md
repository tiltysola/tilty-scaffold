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

The frontend defaults to `http://localhost:3000` for the backend API.

```bash
cp .env.example .env
```

Set `VITE_API_BASE_URL` only when the backend is served from a different URL.
Set `VITE_AUTH_SESSION_STORAGE_KEY` to change the localStorage key used for
frontend session metadata.

## Backend Integration

Access and refresh tokens are stored by the backend in HttpOnly cookies and are
not stored from API response bodies. localStorage keeps only user and
token-expiration metadata. Stored session metadata is cleared when the frontend
cannot validate it with the backend.

Authenticated user metadata includes role and permission keys. The sidebar and
protected routes use those keys for navigation and page access; the backend
remains the source of truth for API authorization.

The registration page reads `/api/auth/config` and shows email verification
only when the backend requires it. The login page reads `/api/auth/sso/config`
and shows the SSO login button only when the backend has SSO enabled. The SSO
start request uses `/api/auth/sso/start`. SSO callback tokens are delivered in
the login URL fragment and consumed by the login page.

The password recovery page reads `/api/auth/config`; when SMTP-backed email is
not enabled, it instructs the user to contact the site administrator.

First-time SSO identities complete account creation or existing-account binding
on the login page.

The users page calls `/api/users/` and is available only when the current user
has `USER_LIST` or `ROOT`. Users with `USER_ADMIN` or `ROOT` can update user
role assignments through `/api/users/:id/roles`.

## Routes

| Route              | Page              |
| ------------------ | ----------------- |
| `/`                | Dashboard         |
| `/dashboard`       | Dashboard         |
| `/users`           | Users             |
| `/login`           | Login             |
| `/forgot-password` | Password recovery |
| `/register`        | Register          |
| `*`                | Not found         |

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
