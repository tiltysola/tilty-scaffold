# tilty-scaffold/backend

Koa TypeScript API scaffold with authentication, Sequelize migrations,
scheduled jobs, Swagger UI, and health checks.

## Commands

Install dependencies from the repository root.
Run commands from `backend/`.

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run db:migrate` | Apply migrations |
| `npm run db:rollback` | Roll back the latest migration |
| `npm run db:status` | Show migration status |
| `npm run test` | Run backend tests |
| `npm run typecheck` | Run TypeScript checks |
| `npm run build` | Clean and compile to `dist/` |
| `npm run clean` | Remove compiled output |
| `npm start` | Start compiled server |

## Environment

```bash
cp .env.example .env
```

Use `.env.example` as the source of supported variables. Backend commands load
`.env` from the backend application directory. Relative runtime paths such as
`DATABASE_STORAGE` and `LOG_LOCAL_PATH` must resolve inside that directory.

Local defaults use SQLite, `DATABASE_SYNC=off`, and migrations for schema
changes. Production requires `DATABASE_SYNC=off`, a non-example
`AUTH_TOKEN_SECRET`, and a CORS allowlist that does not include `*`.

`TRUST_PROXY=false` is the default. Enable `TRUST_PROXY=true` only when the
backend is deployed behind a trusted reverse proxy that controls forwarded
client headers.

`LOG_TARGETS` controls logging destinations. Supported targets are `console`,
`local`, and `sls`; combine them with commas when multiple destinations are
required. The `local` target writes JSON lines to `LOG_LOCAL_PATH`. The `sls`
target requires the `LOG_SLS_*` settings. Request access logs are controlled by
`LOG_REQUEST_ENABLED`.

Authentication-sensitive routes use the in-memory limiter configured by
`AUTH_RATE_LIMIT_WINDOW_MS` and `AUTH_RATE_LIMIT_MAX`.

Registration email verification is disabled by default. Set
`EMAIL_VERIFICATION_SERVICE=smtp`, `SMTP_HOST`, `SMTP_FROM`, and any required
SMTP authentication settings to require emailed verification codes during
account registration and enable password recovery. Verification codes are stored
in process memory.

OIDC SSO is disabled by default. Set `SSO_ENABLED=true` and configure
`SSO_ISSUER_URL`, `SSO_CLIENT_ID`, `SSO_CLIENT_SECRET`, and `SSO_REDIRECT_URI`
to enable authorization-code SSO authentication. The provider callback should use
`/api/auth/sso/callback`; after validation, the backend redirects to
`SSO_FRONTEND_CALLBACK_URL` with a short-lived handoff token for known SSO
identities or a short-lived bind token for first-time SSO identities. Bound SSO
identities are stored as `sub@issuer_host`, for example
`provider-user@passport.mahoutsukai.cn`. First-time SSO users can either create
a new account with a local password or bind the SSO identity to an existing
account. New-account email addresses are taken from the verified SSO token. The
optional `redirect` query on `/api/auth/sso/start` must be a same-origin
application path beginning with a single `/`; absolute URLs, protocol-relative
URLs, and backslashes are rejected.

## API

Authentication uses JWT bearer tokens returned by authentication and registration.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/auth/config` | Return public authentication configuration |
| `POST` | `/api/auth/register` | Create an account |
| `POST` | `/api/auth/register/email-verification` | Send a registration email verification code |
| `POST` | `/api/auth/password-reset/email-verification` | Send a password reset email verification code |
| `POST` | `/api/auth/password-reset` | Reset an account password |
| `POST` | `/api/auth/login` | Authenticate an account |
| `GET` | `/api/auth/me` | Return the authenticated user |
| `GET` | `/api/auth/sso/config` | Return public SSO authentication configuration |
| `GET` | `/api/auth/sso/start` | Redirect to the configured SSO provider |
| `GET` | `/api/auth/sso/callback` | Handle the SSO provider callback |
| `POST` | `/api/auth/sso/session` | Exchange an SSO handoff token for a session |
| `POST` | `/api/auth/sso/account` | Create an account from an unbound SSO identity |
| `POST` | `/api/auth/sso/bind` | Bind an SSO identity to an existing account |
| `GET` | `/api/health` | Return service health |
| `GET` | `/api/health/ready` | Return service readiness |
| `GET` | `/api/openapi.json` | Return the OpenAPI document |
| `GET` | `/api/docs` | Serve Swagger UI |

Error responses use this shape:

```json
{
  "code": 400,
  "error": "FIELD_VALIDATE_ERROR",
  "message": "Request fields are invalid.",
  "details": {}
}
```

## Modules

Authentication, health, documentation, and the demonstration scheduler module are
registered by default. The demonstration module provides a module-owned
scheduled job reference implementation and does not expose HTTP routes.
