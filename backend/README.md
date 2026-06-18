# tilty-scaffold/backend

Koa TypeScript API scaffold with authentication, Sequelize migrations,
RBAC access control, scheduled jobs, Swagger UI, and health checks.

## Commands

Install dependencies from the repository root.
Run commands from `backend/`.

Database commands depend on built `@tilty/shared` outputs; from a fresh
checkout, run `npm --prefix ../shared run build` before `db:migrate`, or use the
root setup flow.

| Command                | Description                          |
| ---------------------- | ------------------------------------ |
| `npm run dev`          | Start development server             |
| `npm run db:migrate`   | Apply migrations                     |
| `npm run db:rollback`  | Roll back the latest migration       |
| `npm run db:status`    | Show migration status                |
| `npm run test`         | Run backend tests                    |
| `npm run lint`         | Run ESLint                           |
| `npm run format`       | Format backend files with Prettier   |
| `npm run format:check` | Check backend formatting             |
| `npm run fix`          | Format files and fix lint violations |
| `npm run typecheck`    | Run TypeScript checks                |
| `npm run build`        | Clean and compile to `dist/`         |
| `npm run clean`        | Remove compiled output               |
| `npm start`            | Start compiled server                |

## Environment

```bash
cp .env.example .env
```

Use `.env.example` as the source of supported variables and defaults. The
sections below summarize the operational configuration groups; keep the full
variable catalog in `.env.example`. Local backend commands load `.env` from the
backend application directory. Production may use platform environment variables
without a local `.env` file. Relative runtime paths such as `DATABASE_STORAGE`,
`LOG_LOCAL_PATH`, and `FILE_LOCAL_ROOT` must resolve inside that directory.

Local defaults use SQLite, `DATABASE_SYNC=off`, and schema migrations.
`db:migrate` applies migrations and synchronizes built-in permissions and roles.
Startup also synchronizes those records after database connection. Production
requires `DATABASE_SYNC=off`, `AUTH_COOKIE_SECURE=true`, a non-example
`AUTH_TOKEN_SECRET`, and a CORS allowlist without `*`. Use MySQL or PostgreSQL
for multi-instance deployments. Keep total pooled database connections across
all backend instances below the database connection limit.

`TRUST_PROXY=false` is the default. Enable `TRUST_PROXY=true` only when the
backend is deployed behind a trusted reverse proxy that controls forwarded
client headers.

`MULTI_INSTANCE_ENABLED=true` enables multi-instance validation. It requires
Redis cache, MySQL or PostgreSQL, and OSS file storage. When scheduled jobs are
enabled in multi-instance mode, Redis locks select one executor for each job
trigger. Configure the lock TTL with `SCHEDULER_LOCK_TTL_MS`. Scheduled jobs
must remain idempotent because distributed locks do not guarantee strict
exactly-once execution.

`LOG_TARGETS` controls logging destinations. Supported targets are `console`,
`local`, and `sls`; combine them with commas when multiple destinations are
required. The `local` target writes JSON lines to `LOG_LOCAL_PATH`. The `sls`
target requires the `LOG_SLS_*` settings. Asynchronous sink backpressure is
controlled by `LOG_PENDING_WRITE_MAX` and `LOG_WRITE_TIMEOUT_MS`. Logger sinks
redact common password, secret, token, authorization, cookie, and access-key
fields before writing records. Request access logs are controlled by
`LOG_REQUEST_ENABLED`.

`CACHE_STORE` controls shared transient state: rate limits, refresh tokens,
email verification, SSO tokens, OIDC metadata, and scheduler locks. Use
`memory` for single-instance deployments and `redis` for multi-instance
deployments. Redis URLs must use `redis://` or `rediss://`; request timeouts are
controlled by `CACHE_REDIS_REQUEST_TIMEOUT_MS`.

Global per-IP rate limits are controlled by `GLOBAL_RATE_LIMIT_WINDOW_MS` and
`GLOBAL_RATE_LIMIT_MAX`. Health checks and CORS preflight requests are excluded.
Authentication-sensitive routes also use the stricter `AUTH_RATE_LIMIT_*`
settings.

`FILE_STORAGE_DRIVER` controls uploaded file storage. Use `local` for
single-instance deployments and `oss` for multi-instance deployments. Local
files are stored under `FILE_LOCAL_ROOT` and served from `FILE_PUBLIC_BASE_URL`.
OSS requires `FILE_OSS_ACCESS_KEY_ID`, `FILE_OSS_ACCESS_KEY_SECRET`,
`FILE_OSS_BUCKET`, `FILE_OSS_ENDPOINT`, and `FILE_OSS_REGION`. Absolute public
file URLs must use HTTPS in production. Avatar uploads are limited by
`FILE_UPLOAD_MAX_BYTES`.

Authentication uses short-lived access tokens and longer-lived refresh tokens.
Browser sessions store both tokens in HttpOnly cookies. Token lifetimes are
controlled by `AUTH_ACCESS_TOKEN_TTL_SECONDS` and
`AUTH_REFRESH_TOKEN_TTL_SECONDS`; cookie names and policies are controlled by
`AUTH_ACCESS_TOKEN_COOKIE_NAME`, `AUTH_REFRESH_TOKEN_COOKIE_NAME`,
`AUTH_COOKIE_SAME_SITE`, and `AUTH_COOKIE_SECURE`. Production requires secure
cookies. Refresh token state uses the configured cache store and is rotated by
`/api/auth/refresh`. Unsafe browser requests must include an `Origin` or
`Referer` header matching the backend origin or a configured `CORS_ORIGINS`
entry.

Authentication-sensitive routes use the configured cache store for the limiter
configured by `AUTH_RATE_LIMIT_WINDOW_MS` and `AUTH_RATE_LIMIT_MAX`.

Access control uses RBAC tables for permissions, roles, role permissions, and
user roles. Built-in permissions and roles are defined in `@tilty/shared` and
are synchronized by `AccessControlService.syncSystemAccessControl()`. Schema
migrations create and evolve the RBAC tables; they do not seed individual
system permissions. To add a built-in permission, update the shared access
control registry, apply it to backend guards, and update frontend navigation or
route guards as needed. The next `db:migrate` or backend startup will upsert
the permission and system-role grants. The initial built-in permissions are
`ROOT`, `USER_ADMIN`, and `USER_LIST`; `ROOT` satisfies all permission checks.
The first registered account receives the `ROOT` role automatically.

Registration email verification is disabled by default. Set
`EMAIL_VERIFICATION_SERVICE=smtp`, `SMTP_HOST`, `SMTP_FROM`, and any required
SMTP authentication settings to require emailed verification codes during
account registration and enable password recovery. Verification code records use
the configured cache store.

OIDC SSO is disabled by default. Set `SSO_ENABLED=true` and configure
`SSO_ISSUER_URL`, `SSO_CLIENT_ID`, `SSO_CLIENT_SECRET`, and `SSO_REDIRECT_URI`
to enable authorization-code SSO authentication. `SSO_ISSUER_URL` accepts a
trailing slash and is normalized before discovery validation. Production SSO
URLs must use HTTPS. OIDC discovery endpoints must use the configured issuer
origin. The provider callback should use `/api/auth/sso/callback`; after
validation, the backend redirects to `SSO_FRONTEND_CALLBACK_URL` with a
short-lived, one-time handoff token for known SSO identities or a short-lived,
one-time bind token for first-time SSO identities in the URL fragment. Bound SSO
identities are stored as `sub@issuer_host`, for example
`provider-user@passport.mahoutsukai.cn`.

First-time SSO users can either create a new account with a local password or
bind the SSO identity to an existing account. New-account email addresses are
taken from the SSO ID token, which must include `email_verified=true`. Symmetric
HS identity-token signatures are accepted only when the OIDC discovery document
explicitly advertises that algorithm. The optional `redirect` query on
`/api/auth/sso/start` must be a same-origin
application path beginning with a single `/`; absolute URLs, protocol-relative
URLs, and backslashes are rejected.

## API

Authentication and registration set access and refresh tokens as HttpOnly
cookies and return only session metadata in the JSON response. Authenticated
browser requests use the configured access-token cookie; session refresh and
logout use the configured refresh-token cookie.

| Method | Path                                          | Description                                    |
| ------ | --------------------------------------------- | ---------------------------------------------- |
| `GET`  | `/api/auth/config`                            | Return public authentication configuration     |
| `POST` | `/api/auth/register`                          | Create an account                              |
| `POST` | `/api/auth/register/email-verification`       | Send a registration email verification code    |
| `POST` | `/api/auth/password-reset/email-verification` | Send a password reset email verification code  |
| `POST` | `/api/auth/password-reset`                    | Reset an account password                      |
| `POST` | `/api/auth/login`                             | Authenticate an account                        |
| `GET`  | `/api/auth/me`                                | Return the authenticated user                  |
| `POST` | `/api/auth/refresh`                           | Refresh the authenticated session              |
| `POST` | `/api/auth/logout`                            | Clear the authenticated session                |
| `POST` | `/api/auth/avatar`                            | Upload the authenticated user's avatar         |
| `GET`  | `/api/auth/sso/config`                        | Return public SSO authentication configuration |
| `GET`  | `/api/auth/sso/start`                         | Redirect to the configured SSO provider        |
| `GET`  | `/api/auth/sso/callback`                      | Handle the SSO provider callback               |
| `POST` | `/api/auth/sso/session`                       | Exchange an SSO handoff token for a session    |
| `POST` | `/api/auth/sso/account`                       | Create an account from an unbound SSO identity |
| `POST` | `/api/auth/sso/bind`                          | Bind an SSO identity to an existing account    |
| `GET`  | `/api/users/`                                 | List paginated users and available roles       |
| `PUT`  | `/api/users/:id/roles`                        | Replace a user's role assignments              |
| `GET`  | `/api/health`                                 | Return service health                          |
| `GET`  | `/api/health/ready`                           | Return service readiness                       |
| `GET`  | `/api/openapi.json`                           | Return the OpenAPI document                    |
| `GET`  | `/api/docs`                                   | Serve Swagger UI                               |

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

Health, authentication, users, documentation, and demo modules are registered by
default. The users module provides RBAC-protected administration endpoints. The
documentation module serves the OpenAPI document and Swagger UI. The demo
module has no public API routes; it registers a scheduler heartbeat job as an
example module-owned job.

The scheduler core runs module-owned jobs when modules define them and
`SCHEDULER_ENABLED=true`.

## Generated and Local Files

Compiled output is written to `dist/` and should be recreated with
`npm run build`. Local SQLite data, uploaded files, and logs are written under
`data/` and `logs/`. Do not edit generated output or local runtime state as
source files.
