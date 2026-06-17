# tilty-scaffold/frontend

Vite React frontend scaffold with React Router, Tailwind CSS, shadcn/ui,
authentication, registration, password recovery, optional SSO authentication,
and a protected dashboard page.

## Commands

Install dependencies from the repository root.
Run commands from `frontend/`.

| Command             | Description              |
| ------------------- | ------------------------ |
| `npm run dev`       | Start development server |
| `npm run test`      | Run frontend tests       |
| `npm run typecheck` | Run TypeScript checks    |
| `npm run build`     | Build production assets  |
| `npm run preview`   | Preview production build |
| `npm run lint`      | Run ESLint               |
| `npm run fix`       | Format code and fix lint violations |
| `npm run clean`     | Remove production build output |

## Environment

The frontend defaults to `http://localhost:3000` for the backend API.

```bash
cp .env.example .env
```

Set `VITE_API_BASE_URL` only when the backend is served from a different URL.
The registration page reads `/api/auth/config` and shows email verification
only when the backend requires it. The login page reads `/api/auth/sso/config`
and shows the SSO login button only when the backend has SSO enabled. The SSO
start request uses `/api/auth/sso/start`.
The password recovery page reads `/api/auth/config`; when SMTP-backed email is
not enabled, it instructs the user to contact the site administrator.
First-time SSO identities complete account creation or existing-account binding
on the login page.

## Routes

| Route              | Page              |
| ------------------ | ----------------- |
| `/`                | Dashboard         |
| `/dashboard`       | Dashboard         |
| `/login`           | Login             |
| `/forgot-password` | Password Recovery |
| `/register`        | Register          |

## Components

Application components live in `src/components/`, page components live under
`src/pages/`, and generated shadcn/ui files stay in `src/shadcn/`. The full
shadcn/ui component set is installed under `src/shadcn/components/ui/`. Add or
update shadcn/ui components through the official CLI:

```bash
npx shadcn@latest add <component>
```
