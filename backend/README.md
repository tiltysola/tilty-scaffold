# tilty-scaffold/backend

Koa TypeScript API scaffold with authentication, Sequelize migrations,
RBAC access control, scheduled jobs, Swagger UI, and health checks.

## Commands

Install dependencies from the repository root.
Run commands from `backend/`.

Database commands depend on built `@tilty/shared` outputs. From a fresh
checkout, run `npm --prefix ../shared run build` before `db:migrate`, or
complete setup.

| Command                | Description                             |
| ---------------------- | --------------------------------------- |
| `npm run dev`          | Start development server                |
| `npm run db:migrate`   | Apply migrations                        |
| `npm run db:rollback`  | Roll back the latest migration          |
| `npm run db:status`    | Show migration status                   |
| `npm run test`         | Run backend tests                       |
| `npm run lint`         | Run ESLint                              |
| `npm run format`       | Format backend files with Prettier      |
| `npm run format:check` | Check backend formatting                |
| `npm run fix`          | Format files and fix lint violations    |
| `npm run typecheck`    | Run TypeScript checks                   |
| `npm run build`        | Clean and compile to `../dist/backend/` |
| `npm run clean`        | Remove compiled output                  |
| `npm start`            | Start compiled server                   |

In production, the compiled backend serves API routes and the compiled frontend
files from `../dist/frontend`. From the repository root, run `npm run build`
and `npm start`.

## Configuration

For manual configuration, copy the repository root `config.toml.example` to
`config.toml` and edit supported configuration keys there.

```bash
cp ../config.toml.example ../config.toml
```

Application configuration is loaded from the repository root `config.toml`.
Process environment variables are used only by setup-only mode before the
backend is locked. `SETUP_TOKEN` optionally supplies the one-time setup token;
otherwise the backend creates `config.toml.setup-token` with mode `0600` and
logs only its path. `SETUP_REMOTE_ENABLED=true` is required before setup may
bind to a non-loopback interface, and remote setup also requires an HTTPS
`APP_DOMAIN`, HTTPS CORS origins, an explicit CSP resource allowlist, and
`SERVER_TRUST_PROXY=true` behind the trusted TLS proxy. Requests that do not
arrive as HTTPS after trusted-proxy handling are rejected in remote setup mode.

Project-defined configuration keys use uppercase snake case and begin with a
domain prefix, such as `APP_`, `SERVER_`, `AUTH_`, `DATABASE_`, `EMAIL_`,
`SMS_`, or `SSO_`. `NODE_ENV` is retained as the standard Node.js runtime
selector, and `SETUP_LOCKED` is reserved for setup state.

Startup enters setup-only mode when `config.toml` is absent, omits
`SETUP_LOCKED`, or sets `SETUP_LOCKED=false`. In setup-only mode,
`/api/setup/*` remains available, browser navigation redirects to `/setup`, and
other API requests return `SETUP_REQUIRED`. `/api/setup/unlock` exchanges the
one-time token for a short-lived HttpOnly cookie; every other setup endpoint is
protected by that cookie and route-specific rate limits. Existing configuration
values are merged into setup defaults, but stored secrets are replaced with a
non-secret placeholder and resolved only on the backend. After setup writes `SETUP_LOCKED=true`,
non-setup API requests return
`SETUP_RESTART_REQUIRED` until restart.

Complete `/setup` in the frontend to write `config.toml`, apply migrations, and
seed built-in access control. A selected database must be empty or contain the
compatible scaffold schema. Setup skips root administrator creation only when
an available user already has the available `ROOT` role; unrelated users do not
suppress root creation. Root user creation and role assignment are transactional
for MySQL and PostgreSQL. The local completion lock records an owner and recovers
locks left by stopped local processes. Setup-only deployment remains a singleton
operation.
Restart the backend to load the generated configuration.
After startup, users with `ROOT` can update the same runtime configuration from
the system settings page. Saving settings writes `config.toml` and requires a
backend restart before changes take effect. System settings access requires a
configured passkey or authenticator app and a verified `system_settings`
step-up challenge before configuration is shown or saved. The setup and system
settings review pages list active configuration fields with sensitive values
masked; inactive provider fields are omitted.
Relative runtime paths such as `DATABASE_STORAGE`, `LOG_LOCAL_PATH`, and
`FILE_LOCAL_ROOT` must resolve inside the project root.

Local defaults use SQLite and schema migrations.
`db:migrate` applies migrations and synchronizes built-in permissions and roles.
Startup validates that migrations are fully applied, then synchronizes those
records after database connection. Production requires an HTTPS `APP_DOMAIN`,
explicit CSP and CORS allowlists without `*`, `AUTH_COOKIE_SECURE=true`, and a
non-example `AUTH_TOKEN_SECRET`. Use MySQL or
PostgreSQL for multi-instance deployments. Keep total pooled database
connections across all backend instances below the database connection limit.

`APP_DOMAIN` defines the primary public application origin, including protocol,
such as `https://app.example.com`. Setup uses this value as the default
`APP_CORS_ORIGINS` allowlist and as the base for generated callback URLs such
as `/sso/callback` and `/api/auth/sso/callback`.
`APP_CSP_RESOURCE_ORIGINS` is the comma- or newline-separated browser resource
origin list applied to connections, fonts, images, and styles. Its development
default `*` allows every network origin; production rejects that value. Use
explicit HTTP or HTTPS origins. Script, form,
frame, and object policies remain fixed.

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
file URLs must use HTTPS in production. Avatar, profile banner, and profile
background uploads are limited by `FILE_UPLOAD_MAX_BYTES`.

Authentication uses short-lived access tokens and longer-lived refresh tokens.
User sessions store both tokens in HttpOnly cookies. Token lifetimes are
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
Step-up verification timing and attempt limits are controlled by
`AUTH_VERIFICATION_CHALLENGE_TTL_SECONDS`,
`AUTH_VERIFICATION_MAX_ATTEMPTS`, and
`AUTH_VERIFICATION_SUDO_TTL_SECONDS`. Passkey display and WebAuthn timing use
`AUTH_PASSKEY_RP_NAME`, `AUTH_PASSKEY_REGISTRATION_TTL_SECONDS`, and
`AUTH_PASSKEY_OPERATION_TIMEOUT_MS`. Authenticator-app setup uses
`AUTH_TOTP_ISSUER` and `AUTH_TOTP_SETUP_TTL_SECONDS`.

Access control uses RBAC tables for permissions, roles, role permissions, and
user roles. Built-in permissions and roles are defined in `@tilty/shared` and
are synchronized by `AccessControlService.syncSystemAccessControl()`. Schema
migrations create and evolve the RBAC tables; they do not seed individual
system permissions. To add a built-in permission, update the shared access
control registry, apply it to backend guards, and update frontend navigation or
route guards as needed. The next `db:migrate` or backend startup will upsert
the permission and system-role grants. The initial built-in permissions are
`ROOT`, `USER_ADMIN`, and `USER_LIST`; `ROOT` satisfies all permission checks.
The first registered account receives the `ROOT` role automatically. A
non-root `USER_ADMIN` can manage only accounts that do not currently have
`USER_ADMIN`; only `ROOT` can read or mutate another administrator's security,
profile, roles, sessions, SSO bindings, media, or API Keys, and only `ROOT` can
grant a role that includes `USER_ADMIN`. Administrators continue to manage
their own account through the normal self-service profile and security routes.

Registration email verification is disabled by default. Set
`EMAIL_VERIFICATION_SERVICE=smtp` and configure `EMAIL_SMTP_PROFILES` as TOML
table arrays containing one or more SMTP profiles to require emailed
verification codes during account registration and enable password recovery.
Each send uses a randomly selected SMTP profile. Each profile requires `host`,
`port`, `secure`, `startTls`, `from`, and `timeoutMs`; `username` and
`password` are optional but must be configured together. Verification code
records use the configured cache store.

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
Setup connection tests reject cloud metadata and link-local targets, use bounded
provider timeouts, and return categorized errors without forwarding raw driver
messages. The file-storage test writes and removes a uniquely named temporary
probe, with a cleanup retry on failure. The SLS test is read-only. The Aliyun SMS
test probes credentials without sending a real SMS.
Verified phone bindings must store phone numbers in E.164 format.

Internationalized backend messages use the request locale from
`X-Tilty-Locale`, falling back to `Accept-Language` and then `en-US`. This
applies to API error messages, setup gate responses, readiness failures, RBAC
display names, and email verification templates. Error responses remain
code-first contracts; clients should rely on `error` for behavior and treat
`message` as display text.

SSO is disabled by default. Set `SSO_ENABLED=true` and configure `SSO_PROFILES`
as TOML table arrays to enable OAuth 2.0 or OpenID Connect providers. Providers
with `loginEnabled=true` are shown on the login page; providers with
`bindingEnabled=true` can be bound from the user profile. Each profile has a
unique `id`, display `name`, optional `iconUrl`, client credentials, callback
URLs, scopes, and protocol-specific endpoints. OIDC profiles use `issuerUrl`
and discovery; OAuth 2.0 profiles use `authorizationUrl`, `tokenUrl`,
`userInfoUrl`, and profile field mappings such as `subjectField`, `emailField`,
and `emailVerifiedField`.

Production SSO URLs must use HTTPS. Setup defaults each profile
`frontendCallbackUrl` to `{APP_DOMAIN}/sso/callback` and `redirectUri` to
`{APP_DOMAIN}/api/auth/sso/callback`; edit the redirect URI when the backend API
uses a separate public origin. OIDC discovery endpoints must use the configured
issuer origin. The provider callback should use `/api/auth/sso/callback`; after
validation, the backend redirects to the profile `frontendCallbackUrl` with a
short-lived, one-time handoff token for known SSO identities, a one-time bind
token for first-time SSO identities, or a profile binding result for
authenticated profile binding. Bound SSO identities are stored by `providerId`
and provider subject, allowing one account to bind multiple providers.

First-time SSO users can either create a new account with a local password or
bind the SSO identity to an existing account. New-account email addresses are
taken from the provider profile and must be verified. Symmetric HS identity-token
signatures are accepted only when the OIDC discovery document explicitly
advertises that algorithm. The optional `providerId` query selects a configured
provider. The optional `redirect` query on `/api/auth/sso/start` and
`/api/auth/sso/bind/start` must be a same-origin application path beginning with
a single `/`; absolute URLs, protocol-relative URLs, and backslashes are
rejected. Authenticated profile binding through `/api/auth/sso/bind/start`
requires a verified `manage_sso` step-up grant before redirecting to the
provider.

## API

Authentication and registration set access and refresh tokens as HttpOnly
cookies and return only session metadata in the JSON response. Authenticated
browser requests use the configured access-token cookie; session refresh and
logout use the configured refresh-token cookie.
Changing the current user's password requires the current password and, when
the account has an available email, SMS, authenticator app, or passkey
verifier, a verified `change_password` step-up grant.
API Keys use `Authorization: Bearer ak_{keyId}_{secret}_{checksum}` and inherit
the current account permissions. They cannot exceed the user's RBAC grants; if
the user is disabled or loses a permission, the API Key loses access as well.
Each account can keep up to 10 active or disabled API Keys. Keys may be created
without an expiration time, and the plain key is returned only once.
API Key management requires a verified session with a `manage_api_key` step-up
grant. API Keys cannot manage API Keys, system settings, login sessions, MFA,
passkeys, SSO, or session-only admin user-management routes.
OpenAPI lists `apiKeyAuth` only on endpoints that accept API Key
authentication. The `Auth` column uses these values:

- `Public`: no session or API Key is required.
- `Setup`: available only while setup endpoints are enabled and requires the
  short-lived setup access cookie created by `/api/setup/unlock`.
- `Session`: requires the authenticated HttpOnly cookie session.
- `Verified session`: requires a session plus the route's documented sensitive
  checks, such as permission, step-up verification, and CSRF for unsafe methods.
- `Verification token`: requires a short-lived verification challenge token.
- `Session or API Key`: accepts either a session or API Key Bearer token.

| Method   | Path                                              | Auth               | Description                                                 |
| -------- | ------------------------------------------------- | ------------------ | ----------------------------------------------------------- |
| `POST`   | `/api/setup/unlock`                               | One-time token     | Create a short-lived setup access cookie                    |
| `GET`    | `/api/setup/defaults`                             | Setup              | Return generated setup defaults                             |
| `POST`   | `/api/setup/validate`                             | Setup              | Validate setup input                                        |
| `POST`   | `/api/setup/validate/environment`                 | Setup              | Validate setup environment fields                           |
| `POST`   | `/api/setup/test/database`                        | Setup              | Test the database schema and root administrator presence    |
| `POST`   | `/api/setup/test/cache`                           | Setup              | Test cache connectivity                                     |
| `POST`   | `/api/setup/test/file-storage`                    | Setup              | Test file storage configuration                             |
| `POST`   | `/api/setup/test/logging`                         | Setup              | Test logging configuration                                  |
| `POST`   | `/api/setup/test/email`                           | Setup              | Test email configuration                                    |
| `POST`   | `/api/setup/test/sms`                             | Setup              | Test SMS configuration                                      |
| `POST`   | `/api/setup/test/sso`                             | Setup              | Test SSO provider discovery                                 |
| `POST`   | `/api/setup/complete`                             | Setup              | Complete setup                                              |
| `GET`    | `/api/auth/config`                                | Public             | Return public authentication configuration                  |
| `POST`   | `/api/auth/register`                              | Public             | Create an account                                           |
| `POST`   | `/api/auth/register/email-verification`           | Public             | Send a registration email verification code                 |
| `POST`   | `/api/auth/password-reset/email-verification`     | Public             | Send a password reset email verification code               |
| `POST`   | `/api/auth/password-reset`                        | Public             | Reset an account password                                   |
| `PATCH`  | `/api/auth/password`                              | Session            | Change the authenticated user's password                    |
| `POST`   | `/api/auth/login`                                 | Public             | Authenticate an account                                     |
| `POST`   | `/api/auth/refresh`                               | Session            | Refresh the authenticated session                           |
| `POST`   | `/api/auth/logout`                                | Session            | Clear the authenticated session                             |
| `GET`    | `/api/auth/totp`                                  | Session            | Return the authenticated user's authenticator-app status    |
| `POST`   | `/api/auth/totp/setup`                            | Session            | Create authenticator-app setup options                      |
| `POST`   | `/api/auth/totp/enable`                           | Session            | Enable authenticator-app verification                       |
| `POST`   | `/api/auth/totp/disable`                          | Session            | Disable authenticator-app verification                      |
| `POST`   | `/api/auth/totp/recovery-codes`                   | Session            | Regenerate authenticator-app recovery codes                 |
| `POST`   | `/api/auth/verification/challenges`               | Session            | Create a step-up verification challenge                     |
| `POST`   | `/api/auth/verification/code`                     | Verification token | Send an email or SMS verification code for a challenge      |
| `POST`   | `/api/auth/verification/passkey/options`          | Verification token | Create passkey authentication options for a challenge       |
| `POST`   | `/api/auth/verification/confirm`                  | Verification token | Confirm a sign-in or step-up verification challenge         |
| `GET`    | `/api/auth/mfa`                                   | Session            | Return the authenticated user's MFA settings                |
| `PATCH`  | `/api/auth/mfa`                                   | Session            | Update the authenticated user's MFA settings                |
| `GET`    | `/api/auth/passkeys`                              | Session            | List the authenticated user's passkeys                      |
| `POST`   | `/api/auth/passkeys/registration-options`         | Session            | Create passkey registration options                         |
| `POST`   | `/api/auth/passkeys`                              | Session            | Verify and add a passkey                                    |
| `DELETE` | `/api/auth/passkeys/:passkeyId`                   | Session            | Remove one of the authenticated user's passkeys             |
| `GET`    | `/api/auth/devices`                               | Session            | List the authenticated user's active devices                |
| `DELETE` | `/api/auth/devices/others`                        | Session            | Revoke all other authenticated device sessions              |
| `DELETE` | `/api/auth/devices/:sessionId`                    | Session            | Revoke an authenticated device session                      |
| `GET`    | `/api/auth/sso/config`                            | Public             | Return public SSO authentication configuration              |
| `GET`    | `/api/auth/sso/start`                             | Public             | Redirect to the configured SSO provider                     |
| `GET`    | `/api/auth/sso/bind/start`                        | Session            | Redirect for profile binding after step-up verification     |
| `GET`    | `/api/auth/sso/identities`                        | Session            | Return SSO identities bound to the current user             |
| `GET`    | `/api/auth/sso/callback`                          | Public             | Handle the SSO provider callback                            |
| `POST`   | `/api/auth/sso/session`                           | Public             | Exchange an SSO handoff token for a session                 |
| `POST`   | `/api/auth/sso/account`                           | Public             | Create an account from an unbound SSO identity              |
| `POST`   | `/api/auth/sso/bind`                              | Public             | Bind an SSO identity to an existing account                 |
| `GET`    | `/api/api-keys`                                   | Verified session   | List API Keys for the current user                          |
| `POST`   | `/api/api-keys`                                   | Verified session   | Create an API Key                                           |
| `POST`   | `/api/api-keys/:id/disable`                       | Verified session   | Disable an API Key                                          |
| `POST`   | `/api/api-keys/:id/enable`                        | Verified session   | Enable an API Key                                           |
| `POST`   | `/api/api-keys/:id/revoke`                        | Verified session   | Revoke an API Key                                           |
| `GET`    | `/api/admin/api-keys`                             | Verified session   | List API Keys for manageable users                          |
| `POST`   | `/api/admin/api-keys/:id/revoke`                  | Verified session   | Revoke an API Key for a manageable user                     |
| `GET`    | `/api/users/me`                                   | Session or API Key | Return the authenticated user                               |
| `PATCH`  | `/api/users/me`                                   | Session or API Key | Update the authenticated user's profile                     |
| `POST`   | `/api/users/me/email-verification`                | Session            | Send a profile email verification code                      |
| `POST`   | `/api/users/me/email-verification/confirm`        | Session            | Confirm a profile email verification code                   |
| `POST`   | `/api/users/me/phone-verification`                | Session            | Send a profile phone verification code                      |
| `POST`   | `/api/users/me/phone-verification/confirm`        | Session            | Confirm a profile phone verification code                   |
| `POST`   | `/api/users/me/avatar`                            | Session or API Key | Upload the authenticated user's avatar                      |
| `DELETE` | `/api/users/me/avatar`                            | Session or API Key | Remove the authenticated user's avatar                      |
| `POST`   | `/api/users/me/profile-banner`                    | Session or API Key | Upload the authenticated user's profile banner              |
| `DELETE` | `/api/users/me/profile-banner`                    | Session or API Key | Remove the authenticated user's profile banner              |
| `POST`   | `/api/users/me/profile-background`                | Session or API Key | Upload the authenticated user's profile background          |
| `DELETE` | `/api/users/me/profile-background`                | Session or API Key | Remove the authenticated user's profile background          |
| `GET`    | `/api/admin/users/`                               | Verified session   | List users with user-list access                            |
| `GET`    | `/api/admin/users/:id/details`                    | Verified session   | Return managed user details after verification              |
| `PUT`    | `/api/admin/users/:id`                            | Verified session   | Update a managed user after verification                    |
| `PUT`    | `/api/admin/users/:id/roles`                      | Verified session   | Replace user roles after verification                       |
| `PATCH`  | `/api/admin/users/:id/mfa`                        | Verified session   | Update managed user MFA settings after verification         |
| `POST`   | `/api/admin/users/:id/totp/disable`               | Verified session   | Disable managed user TOTP after verification                |
| `DELETE` | `/api/admin/users/:id/passkeys/:passkeyId`        | Verified session   | Remove a managed user passkey after verification            |
| `GET`    | `/api/admin/users/:id/devices`                    | Verified session   | List managed user login devices after verification          |
| `DELETE` | `/api/admin/users/:id/devices`                    | Verified session   | Revoke managed user login devices after verification        |
| `DELETE` | `/api/admin/users/:id/devices/:sessionId`         | Verified session   | Revoke one managed user login device after verification     |
| `GET`    | `/api/admin/users/:id/sso-identities`             | Verified session   | List managed user SSO bindings after verification           |
| `DELETE` | `/api/admin/users/:id/sso-identities/:providerId` | Verified session   | Remove a managed user SSO binding after verification        |
| `POST`   | `/api/admin/users/:id/avatar`                     | Verified session   | Upload a managed user avatar after verification             |
| `DELETE` | `/api/admin/users/:id/avatar`                     | Verified session   | Remove a managed user avatar after verification             |
| `POST`   | `/api/admin/users/:id/profile-banner`             | Verified session   | Upload a managed user profile banner after verification     |
| `DELETE` | `/api/admin/users/:id/profile-banner`             | Verified session   | Remove a managed user profile banner after verification     |
| `POST`   | `/api/admin/users/:id/profile-background`         | Verified session   | Upload a managed user profile background after verification |
| `DELETE` | `/api/admin/users/:id/profile-background`         | Verified session   | Remove a managed user profile background after verification |
| `GET`    | `/api/users/profile-options/genders`              | Session or API Key | Return gender profile options                               |
| `GET`    | `/api/users/profile-options/locations/countries`  | Public             | Return country location options                             |
| `GET`    | `/api/users/profile-options/locations/regions`    | Public             | Return region location options                              |
| `GET`    | `/api/users/profile-options/locations/cities`     | Public             | Return city location options                                |
| `GET`    | `/api/admin/system-settings/`                     | Verified session   | Return system settings                                      |
| `PUT`    | `/api/admin/system-settings/`                     | Verified session   | Update system settings                                      |
| `GET`    | `/api/health`                                     | Public             | Return service health                                       |
| `GET`    | `/api/health/ready`                               | Public             | Return service readiness                                    |
| `GET`    | `/api/openapi.json`                               | Public             | Return the OpenAPI document                                 |
| `GET`    | `/api/docs`                                       | Public             | Serve Swagger UI                                            |

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

Setup, health, authentication, API Keys, users, admin, documentation, and demo
modules are registered by default. The API Key module manages account API Keys.
The users module serves current-user profile APIs and profile form lookup data.
The admin module provides RBAC-protected user management, system settings, and
API Key oversight endpoints. The documentation module serves the OpenAPI
document and Swagger UI. The demo module has no public API routes; it registers
a scheduler heartbeat job as an example module-owned job.

The scheduler core runs module-owned jobs when modules define them and
`SCHEDULER_ENABLED=true`.

## Generated and Local Files

Compiled output is written to `../dist/backend` and should be recreated with
`npm run build`. Local SQLite data, uploaded files, and logs are written under
root `../data/` and `../logs/`. Do not edit generated output or local runtime
state as source files.
