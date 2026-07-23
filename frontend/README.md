# tilty-scaffold/frontend

Vite React frontend scaffold with React Router, Tailwind CSS, shadcn/ui,
authentication, registration, password recovery, optional SSO authentication,
public landing page, protected dashboard, and permission-gated administration
pages.

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

Production output is written to `../dist/frontend` and is served by the
compiled backend when running `npm start` from the repository root.

## Environment

The frontend uses relative API paths. During development, Vite proxies the
`/api` and `/uploads` route prefixes to `http://localhost:3000`.

## Theme Modes

The public landing page and authenticated application layout expose the same
theme mode dropdown. Supported modes are Auto, Light, and Dark. Auto uses the
authenticated user's profile background theme when one is available and falls
back to the operating system preference otherwise.

## Internationalization

React Intl provides runtime localization. Supported locale catalogs live under
`src/i18n/messages/`; each catalog must keep the same message keys as
`en-US.ts`. The application stores the selected locale in localStorage, updates
`html lang` and `dir`, and sends `X-Tilty-Locale` with API requests.

When adding user-facing text, use message ids instead of inline literals.
Technical contracts such as API paths, environment variable names, permission
keys, role keys, cookie names, and storage keys must remain untranslated.

## Backend Integration

Setup routing is controlled by the backend. While setup is required, browser
navigation redirects to `/setup`, and non-setup API requests return
`SETUP_REQUIRED`. After setup completes, non-setup API requests return
`SETUP_RESTART_REQUIRED` until restart, and direct `/setup` visits return to
`/login`. Backend setup lock configuration is documented in `backend/README.md`.

The setup page first exchanges the one-time backend setup token for a
30-minute HttpOnly setup cookie, then applies migrations through
`/api/setup/*`. Database, Redis cache, OSS storage, SLS logging, SMTP email,
Aliyun SMS, and SSO must pass connection tests when enabled. The database step
detects a compatible schema and an available root administrator; unrelated
existing users do not suppress root creation. Configuration without a network
dependency is validated for required values and URL or email format. Review
pages list active configuration fields with sensitive values represented by
non-secret placeholders and omit inactive provider fields. The application
domain defaults to the current frontend origin, and CORS origins default to
that domain.

Access and refresh tokens are stored by the backend in HttpOnly cookies and are
not stored from API response bodies. localStorage keeps only token-expiration
metadata. User state is refreshed from `/api/users/me`, and stored session
metadata is cleared when the frontend cannot validate it with the backend.

Authenticated user metadata includes role and permission keys. The dashboard
displays authenticated user context and application status. The sidebar and
protected routes use role and permission keys for navigation and page access;
the backend remains the source of truth for API authorization.
On the Users page, a non-root user administrator can see administrator
directory entries but cannot open their management dialog or assign
administrator roles; only a root administrator can manage another
administrator account.

The profile page updates the current user's profile fields through
`PATCH /api/users/me`. Gender and location editing use server-provided options
while allowing custom text. Avatar, profile banner, and profile background
uploads use `/api/users/me/avatar`, `/api/users/me/profile-banner`, and
`/api/users/me/profile-background`. Unverified email status uses
`/api/users/me/email-verification` and
`/api/users/me/email-verification/confirm`. Phone binding uses
`/api/users/me/phone-verification` and
`/api/users/me/phone-verification/confirm` when SMS verification is configured.

The registration page reads `/api/auth/config` and shows email verification
only when the backend requires it. The login page reads `/api/auth/sso/config`
and shows configured SSO provider buttons for providers with login enabled. SSO
start requests use `/api/auth/sso/start` with an optional `providerId`. SSO
callback tokens are delivered in the `/sso/callback` URL fragment and consumed
by the SSO callback page.

The password recovery page reads `/api/auth/config`; when SMTP-backed email is
not enabled, it instructs the user to contact the site administrator.

The security page changes the current user's password through
`PATCH /api/auth/password`. When the account has an available email, SMS,
authenticator app, or passkey verifier, the page completes a `change_password`
step-up challenge before opening the password form. Successful password changes
revoke the user's other active sessions.

First-time SSO identities complete account creation or existing-account binding
on the SSO callback page. The profile page reads `/api/auth/sso/identities` and
starts profile provider binding through `/api/auth/sso/bind/start` only after a
verified `manage_sso` step-up challenge.

The users page calls `/api/admin/users/` and is available only when the current
user has `USER_LIST` or `ROOT`, has a passkey or authenticator app configured,
and has completed a `user_management` step-up challenge. Users with
`USER_ADMIN` or `ROOT` can update managed user profile fields, password,
account status, and role assignments through `/api/admin/users/:id` after the
same `user_management` verification. The user edit page lists managed login
devices and can revoke one device session or all revocable device sessions
through `/api/admin/users/:id/devices`.

The system settings page calls `/api/admin/system-settings/` and is available
only when the current user has `ROOT`. Before loading settings, the page
creates a `system_settings` step-up verification challenge. The backend requires
the root user to have a passkey or authenticator app configured, and settings
remain hidden until that challenge is verified. Saving settings requires a
backend restart before the updated configuration is used.

## Routes

| Route              | Page                 |
| ------------------ | -------------------- |
| `/`                | Landing page         |
| `/dashboard`       | Dashboard            |
| `/users`           | Users                |
| `/settings`        | System Settings      |
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

Production output is written to `../dist/frontend` and should be recreated with
`npm run build`. Generated shadcn/ui files should be changed only through the
official CLI.
