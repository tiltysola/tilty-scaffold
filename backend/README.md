# tilty-scaffold/backend

Koa TypeScript API scaffold with authentication, Sequelize migrations,
RBAC access control, scheduled jobs, Swagger UI, and health checks.

## Commands

Install dependencies from the repository root.
Run commands from `backend/`.

Database commands depend on built `@tilty/shared` outputs. From a fresh
checkout, run `npm --prefix ../shared run build` before `db:migrate`, or
complete setup.

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

In production, the compiled backend serves API routes and the compiled frontend
files from `../frontend/dist`.

## Configuration

For manual configuration, copy `config.toml.example` to `config.toml` and edit
supported configuration keys there.

```bash
cp config.toml.example config.toml
```

Application configuration is loaded from `config.toml`. Process environment
variables are used only by setup-only mode before the backend is locked.

Project-defined configuration keys use uppercase snake case and begin with a
domain prefix, such as `APP_`, `SERVER_`, `AUTH_`, `DATABASE_`, `EMAIL_`,
`SMS_`, or `SSO_`. `NODE_ENV` is retained as the standard Node.js runtime
selector, and `SETUP_LOCKED` is reserved for setup state.

Startup enters setup-only mode when `config.toml` is absent, omits
`SETUP_LOCKED`, or sets `SETUP_LOCKED=false`. In setup-only mode,
`/api/setup/*` remains available, browser navigation redirects to `/setup`, and
other API requests return `SETUP_REQUIRED`. Existing configuration values are
merged into setup defaults. After setup writes `SETUP_LOCKED=true`,
non-setup API requests return
`SETUP_RESTART_REQUIRED` until restart.

Complete `/setup` in the frontend to write `config.toml`, apply migrations, and
seed built-in access control. Setup creates the root administrator only when the
selected database has no available users; otherwise existing users are retained.
Restart the backend to load the generated configuration.
Relative runtime paths such as `DATABASE_STORAGE`, `LOG_LOCAL_PATH`, and
`FILE_LOCAL_ROOT` must resolve inside the backend application directory.

Local defaults use SQLite, `DATABASE_SYNC=off`, and schema migrations.
`db:migrate` applies migrations and synchronizes built-in permissions and roles.
Startup validates that migrations are fully applied when `DATABASE_SYNC=off`,
then synchronizes those records after database connection. Production requires
`DATABASE_SYNC=off`, `AUTH_COOKIE_SECURE=true`, a non-example
`AUTH_TOKEN_SECRET`, and a CORS allowlist without `*`. Use MySQL or PostgreSQL
for multi-instance deployments. Keep total pooled database connections across
all backend instances below the database connection limit.

`APP_DOMAIN` defines the primary public application origin, including protocol,
such as `https://app.example.com`. Setup uses this value as the default
`APP_CORS_ORIGINS` allowlist and as the base for generated callback URLs such
as `/sso/callback` and `/api/auth/sso/callback`.

`SERVER_TRUST_PROXY=false` is the default. Enable `SERVER_TRUST_PROXY=true`
only when the backend is deployed behind a trusted reverse proxy that controls
forwarded client headers.

`SERVER_MULTI_INSTANCE_ENABLED=true` enables multi-instance validation. It
requires Redis cache, MySQL or PostgreSQL, and OSS file storage. When scheduled
jobs are enabled in multi-instance mode, Redis locks select one executor for
each job trigger. Configure the lock TTL with `SCHEDULER_LOCK_TTL_MS`.
Scheduled jobs must remain idempotent because distributed locks do not
guarantee strict exactly-once execution.

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
`Referer` header matching the backend origin or a configured `APP_CORS_ORIGINS`
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
`EMAIL_VERIFICATION_SERVICE=smtp` and configure `EMAIL_SMTP_PROFILES` as TOML
table arrays containing one or more SMTP profiles to require emailed
verification codes during account registration and enable password recovery.
Each send uses a randomly selected SMTP profile. Each profile requires `host`,
`port`,
`secure`, `startTls`, `from`, and `timeoutMs`; `username` and `password` are
optional but must be configured together. Verification code records use the
configured cache store.

SMS verification configuration is disabled by default. Set
`SMS_VERIFICATION_SERVICE=aliyun` and configure `SMS_ALICLOUD_PROFILES` as a
TOML table array to enable Aliyun SMS profile validation. Profiles are keyed by
`phoneCountryCode`; supported values are `+86`, `+852`, and `+853`. The `+86`
profile uses Dysmsapi `2017-05-25` `SendSms` with `signName` and
`templateCode`. The `+852` and `+853` profiles use Dysmsapi `2018-05-01`
`SendMessageToGlobe` with the Singapore endpoint
`dysmsapi.ap-southeast-1.aliyuncs.com`, `regionId=ap-southeast-1`, and
`messageTemplate`. Verification code timing is controlled by
`SMS_VERIFICATION_CODE_EXPIRES_IN_MS` and `SMS_VERIFICATION_CODE_COOLDOWN_MS`.
The setup connection test probes Aliyun credentials without sending a real SMS.
Verified phone bindings must store phone numbers in E.164 format.

SSO is disabled by default. Set `SSO_ENABLED=true` and configure `SSO_PROFILES`
as TOML table arrays to enable OAuth 2.0 or OpenID Connect providers. Providers
with `loginEnabled=true` are shown on the login page; providers with
`bindingEnabled=true` can be bound from the user profile. Each profile has a
unique `id`, display `name`, optional `iconUrl`, client credentials, callback
URLs, scopes, and protocol-specific endpoints. OIDC profiles use `issuerUrl`
and discovery; OAuth 2.0 profiles use
`authorizationUrl`, `tokenUrl`, `userInfoUrl`, and profile field mappings such
as `subjectField`, `emailField`, and `emailVerifiedField`.

Production SSO URLs must use HTTPS. Setup defaults each profile
`frontendCallbackUrl` to `{APP_DOMAIN}/sso/callback` and `redirectUri` to
`{APP_DOMAIN}/api/auth/sso/callback`; edit the redirect URI when the backend API
uses a separate public origin. OIDC discovery endpoints must use the configured
issuer origin. The provider callback should use `/api/auth/sso/callback`; after
validation, the backend redirects to the profile `frontendCallbackUrl` with a
short-lived, one-time handoff token for known SSO identities, a one-time bind
token for first-time SSO identities, or a profile binding result for
authenticated profile binding. Bound SSO identities are stored by `providerId`
and provider subject,
allowing one account to bind multiple providers.

First-time SSO users can either create a new account with a local password or
bind the SSO identity to an existing account. New-account email addresses are
taken from the provider profile and must be verified. Symmetric HS identity-token
signatures are accepted only when the OIDC discovery document explicitly
advertises that algorithm. The optional `providerId` query selects a configured
provider. The optional `redirect` query on `/api/auth/sso/start` and
`/api/auth/sso/bind/start` must be a same-origin application path beginning with
a single `/`; absolute URLs, protocol-relative URLs, and backslashes are
rejected.

## API

Authentication and registration set access and refresh tokens as HttpOnly
cookies and return only session metadata in the JSON response. Authenticated
browser requests use the configured access-token cookie; session refresh and
logout use the configured refresh-token cookie.

| Method  | Path                                          | Description                                     |
| ------- | --------------------------------------------- | ----------------------------------------------- |
| `GET`   | `/api/setup/defaults`                         | Return generated setup defaults                 |
| `POST`  | `/api/setup/validate`                         | Validate setup input                            |
| `POST`  | `/api/setup/validate/environment`             | Validate setup environment fields               |
| `POST`  | `/api/setup/test/database`                    | Test database connectivity and user presence    |
| `POST`  | `/api/setup/test/cache`                       | Test cache connectivity                         |
| `POST`  | `/api/setup/test/file-storage`                | Test file storage configuration                 |
| `POST`  | `/api/setup/test/logging`                     | Test logging configuration                      |
| `POST`  | `/api/setup/test/email`                       | Test email configuration                        |
| `POST`  | `/api/setup/test/sms`                         | Test SMS configuration                          |
| `POST`  | `/api/setup/test/sso`                         | Test SSO provider discovery                     |
| `POST`  | `/api/setup/complete`                         | Complete setup                                  |
| `GET`   | `/api/auth/config`                            | Return public authentication configuration      |
| `POST`  | `/api/auth/register`                          | Create an account                               |
| `POST`  | `/api/auth/register/email-verification`       | Send a registration email verification code     |
| `POST`  | `/api/auth/password-reset/email-verification` | Send a password reset email verification code   |
| `POST`  | `/api/auth/password-reset`                    | Reset an account password                       |
| `POST`  | `/api/auth/login`                             | Authenticate an account                         |
| `GET`   | `/api/auth/me`                                | Return the authenticated user                   |
| `PATCH` | `/api/auth/me`                                | Update the authenticated user's profile         |
| `POST`  | `/api/auth/me/email-verification`             | Send a profile email verification code          |
| `POST`  | `/api/auth/me/email-verification/confirm`     | Confirm a profile email verification code       |
| `POST`  | `/api/auth/me/phone-verification`             | Send a profile phone verification code          |
| `POST`  | `/api/auth/me/phone-verification/confirm`     | Confirm a profile phone verification code       |
| `POST`  | `/api/auth/refresh`                           | Refresh the authenticated session               |
| `POST`  | `/api/auth/logout`                            | Clear the authenticated session                 |
| `POST`  | `/api/auth/avatar`                            | Upload the authenticated user's avatar          |
| `GET`   | `/api/auth/sso/config`                        | Return public SSO authentication configuration  |
| `GET`   | `/api/auth/sso/start`                         | Redirect to the configured SSO provider         |
| `GET`   | `/api/auth/sso/bind/start`                    | Redirect to an SSO provider for profile binding |
| `GET`   | `/api/auth/sso/identities`                    | Return SSO identities bound to the current user |
| `GET`   | `/api/auth/sso/callback`                      | Handle the SSO provider callback                |
| `POST`  | `/api/auth/sso/session`                       | Exchange an SSO handoff token for a session     |
| `POST`  | `/api/auth/sso/account`                       | Create an account from an unbound SSO identity  |
| `POST`  | `/api/auth/sso/bind`                          | Bind an SSO identity to an existing account     |
| `GET`   | `/api/users/`                                 | List paginated users and available roles        |
| `PUT`   | `/api/users/:id`                              | Update a managed user                           |
| `PUT`   | `/api/users/:id/roles`                        | Replace a user's role assignments               |
| `GET`   | `/api/health`                                 | Return service health                           |
| `GET`   | `/api/health/ready`                           | Return service readiness                        |
| `GET`   | `/api/openapi.json`                           | Return the OpenAPI document                     |
| `GET`   | `/api/docs`                                   | Serve Swagger UI                                |

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

Setup, health, authentication, users, documentation, and demo modules are
registered by default. The users module provides RBAC-protected administration
endpoints. The documentation module serves the OpenAPI document and Swagger UI.
The demo module has no public API routes; it registers a scheduler heartbeat job
as an example module-owned job.

The scheduler core runs module-owned jobs when modules define them and
`SCHEDULER_ENABLED=true`.

## Generated and Local Files

Compiled output is written to `dist/` and should be recreated with
`npm run build`. Local SQLite data, uploaded files, and logs are written under
`data/` and `logs/`. Do not edit generated output or local runtime state as
source files.
