const setupEnvironmentKeys = [
  'NODE_ENV',
  'SERVER_HOST',
  'SERVER_PORT',
  'APP_DOMAIN',
  'APP_CORS_ORIGINS',
  'SERVER_TRUST_PROXY',
  'SERVER_MULTI_INSTANCE_ENABLED',
  'DATABASE_DIALECT',
  'DATABASE_STORAGE',
  'DATABASE_URL',
  'DATABASE_SSL',
  'DATABASE_CONNECT_TIMEOUT_MS',
  'DATABASE_POOL_MAX',
  'DATABASE_POOL_MIN',
  'DATABASE_POOL_ACQUIRE_MS',
  'DATABASE_POOL_IDLE_MS',
  'DATABASE_SYNC',
  'CACHE_STORE',
  'CACHE_REDIS_URL',
  'CACHE_REDIS_REQUEST_TIMEOUT_MS',
  'FILE_STORAGE_DRIVER',
  'FILE_UPLOAD_MAX_BYTES',
  'FILE_PUBLIC_BASE_URL',
  'FILE_LOCAL_ROOT',
  'FILE_OSS_ACCESS_KEY_ID',
  'FILE_OSS_ACCESS_KEY_SECRET',
  'FILE_OSS_BUCKET',
  'FILE_OSS_ENDPOINT',
  'FILE_OSS_REGION',
  'FILE_OSS_PUBLIC_BASE_URL',
  'SCHEDULER_ENABLED',
  'SCHEDULER_LOCK_TTL_MS',
  'AUTH_TOKEN_SECRET',
  'AUTH_ACCESS_TOKEN_TTL_SECONDS',
  'AUTH_REFRESH_TOKEN_TTL_SECONDS',
  'AUTH_ACCESS_TOKEN_COOKIE_NAME',
  'AUTH_REFRESH_TOKEN_COOKIE_NAME',
  'AUTH_COOKIE_SAME_SITE',
  'AUTH_COOKIE_SECURE',
  'AUTH_RATE_LIMIT_WINDOW_MS',
  'AUTH_RATE_LIMIT_MAX',
  'GLOBAL_RATE_LIMIT_WINDOW_MS',
  'GLOBAL_RATE_LIMIT_MAX',
  'LOG_REQUEST_ENABLED',
  'LOG_TARGETS',
  'LOG_PENDING_WRITE_MAX',
  'LOG_WRITE_TIMEOUT_MS',
  'LOG_LOCAL_PATH',
  'LOG_SLS_ENDPOINT',
  'LOG_SLS_PROJECT',
  'LOG_SLS_LOGSTORE',
  'LOG_SLS_ACCESS_KEY_ID',
  'LOG_SLS_ACCESS_KEY_SECRET',
  'LOG_SLS_TOPIC',
  'LOG_SLS_SOURCE',
  'EMAIL_VERIFICATION_SERVICE',
  'EMAIL_VERIFICATION_CODE_EXPIRES_IN_MS',
  'EMAIL_VERIFICATION_CODE_COOLDOWN_MS',
  'EMAIL_SMTP_PROFILES',
  'SMS_VERIFICATION_SERVICE',
  'SMS_VERIFICATION_CODE_EXPIRES_IN_MS',
  'SMS_VERIFICATION_CODE_COOLDOWN_MS',
  'SMS_ALICLOUD_PROFILES',
  'SSO_ENABLED',
  'SSO_PROFILES',
] as const;

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Tilty Scaffold API',
    version: '0.1.5',
  },
  servers: [
    {
      url: '/',
      description: 'Current origin',
    },
  ],
  tags: [
    {
      name: 'Setup',
      description: 'Setup endpoints',
    },
    {
      name: 'Auth',
      description: 'Authentication endpoints',
    },
    {
      name: 'Users',
      description: 'User administration endpoints',
    },
    {
      name: 'Health',
      description: 'Service health endpoints',
    },
    {
      name: 'Docs',
      description: 'API documentation endpoints',
    },
  ],
  paths: {
    '/api/setup/defaults': {
      get: {
        tags: ['Setup'],
        summary: 'Return setup defaults',
        responses: {
          '200': {
            description: 'Setup defaults',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    {
                      $ref: '#/components/schemas/ApiSuccess',
                    },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          $ref: '#/components/schemas/SetupDefaults',
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          '403': {
            $ref: '#/components/responses/SetupLocked',
          },
        },
      },
    },
    '/api/setup/validate': {
      post: {
        tags: ['Setup'],
        summary: 'Validate setup input',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/SetupCompleteRequest',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Setup input is valid',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    {
                      $ref: '#/components/schemas/ApiSuccess',
                    },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'object',
                          required: ['valid'],
                          properties: {
                            valid: {
                              type: 'boolean',
                              const: true,
                            },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          '400': {
            $ref: '#/components/responses/ValidationError',
          },
          '403': {
            $ref: '#/components/responses/SetupForbidden',
          },
        },
      },
    },
    '/api/setup/validate/environment': {
      post: {
        tags: ['Setup'],
        summary: 'Validate setup environment fields',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/SetupEnvironmentRequest',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Setup environment is valid',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    {
                      $ref: '#/components/schemas/ApiSuccess',
                    },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'object',
                          required: ['valid'],
                          properties: {
                            valid: {
                              type: 'boolean',
                              const: true,
                            },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          '400': {
            $ref: '#/components/responses/ValidationError',
          },
          '403': {
            $ref: '#/components/responses/SetupForbidden',
          },
        },
      },
    },
    '/api/setup/test/database': {
      post: {
        tags: ['Setup'],
        summary: 'Test setup database connectivity',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/SetupEnvironmentRequest',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Database connection succeeded',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/SetupConnectionTestResponse',
                },
              },
            },
          },
          '400': {
            description: 'Database connection failed',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ApiFailure',
                },
              },
            },
          },
          '403': {
            $ref: '#/components/responses/SetupForbidden',
          },
        },
      },
    },
    '/api/setup/test/cache': {
      post: {
        tags: ['Setup'],
        summary: 'Test setup cache connectivity',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/SetupEnvironmentRequest',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Cache connection succeeded',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/SetupCacheConnectionTestResponse',
                },
              },
            },
          },
          '400': {
            description: 'Cache connection failed',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ApiFailure',
                },
              },
            },
          },
          '403': {
            $ref: '#/components/responses/SetupForbidden',
          },
        },
      },
    },
    '/api/setup/test/file-storage': {
      post: {
        tags: ['Setup'],
        summary: 'Test setup file storage connectivity',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/SetupEnvironmentRequest',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'File storage test succeeded',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/SetupFileStorageConnectionTestResponse',
                },
              },
            },
          },
          '400': {
            description: 'File storage test failed',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ApiFailure',
                },
              },
            },
          },
          '403': {
            $ref: '#/components/responses/SetupForbidden',
          },
        },
      },
    },
    '/api/setup/test/logging': {
      post: {
        tags: ['Setup'],
        summary: 'Test setup logging connectivity',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/SetupEnvironmentRequest',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Logging test succeeded',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/SetupLoggingConnectionTestResponse',
                },
              },
            },
          },
          '400': {
            description: 'Logging test failed',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ApiFailure',
                },
              },
            },
          },
          '403': {
            $ref: '#/components/responses/SetupForbidden',
          },
        },
      },
    },
    '/api/setup/test/email': {
      post: {
        tags: ['Setup'],
        summary: 'Test setup email connectivity',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/SetupEnvironmentRequest',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Email test succeeded',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/SetupEmailConnectionTestResponse',
                },
              },
            },
          },
          '400': {
            description: 'Email test failed',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ApiFailure',
                },
              },
            },
          },
          '403': {
            $ref: '#/components/responses/SetupForbidden',
          },
        },
      },
    },
    '/api/setup/test/sms': {
      post: {
        tags: ['Setup'],
        summary: 'Test setup SMS configuration',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/SetupEnvironmentRequest',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'SMS test succeeded',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/SetupSmsConnectionTestResponse',
                },
              },
            },
          },
          '400': {
            description: 'SMS test failed',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ApiFailure',
                },
              },
            },
          },
          '403': {
            $ref: '#/components/responses/SetupForbidden',
          },
        },
      },
    },
    '/api/setup/test/sso': {
      post: {
        tags: ['Setup'],
        summary: 'Test setup SSO discovery',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/SetupEnvironmentRequest',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'SSO test succeeded',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/SetupSsoConnectionTestResponse',
                },
              },
            },
          },
          '400': {
            description: 'SSO test failed',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ApiFailure',
                },
              },
            },
          },
          '403': {
            $ref: '#/components/responses/SetupForbidden',
          },
        },
      },
    },
    '/api/setup/complete': {
      post: {
        tags: ['Setup'],
        summary: 'Complete setup',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/SetupCompleteRequest',
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Setup completed',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/SetupCompleteResponse',
                },
              },
            },
          },
          '400': {
            $ref: '#/components/responses/ValidationError',
          },
          '403': {
            $ref: '#/components/responses/SetupForbidden',
          },
          '409': {
            description: 'Setup is already running',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ApiFailure',
                },
              },
            },
          },
        },
      },
    },
    '/api/auth/config': {
      get: {
        tags: ['Auth'],
        summary: 'Return authentication configuration',
        responses: {
          '200': {
            description: 'Authentication configuration',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    {
                      $ref: '#/components/schemas/ApiSuccess',
                    },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          $ref: '#/components/schemas/AuthConfig',
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
    },
    '/api/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Create an account',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/RegisterRequest',
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Authenticated browser session metadata; tokens are set in HttpOnly cookies',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/AuthSessionResponse',
                },
              },
            },
          },
          '400': {
            $ref: '#/components/responses/ValidationError',
          },
          '403': {
            $ref: '#/components/responses/CsrfForbidden',
          },
          '409': {
            $ref: '#/components/responses/AccountIdentifierConflict',
          },
          '429': {
            $ref: '#/components/responses/RateLimited',
          },
        },
      },
    },
    '/api/auth/register/email-verification': {
      post: {
        tags: ['Auth'],
        summary: 'Send a registration email verification code',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/SendRegistrationEmailVerificationRequest',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Email verification send metadata',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/EmailVerificationSendResponse',
                },
              },
            },
          },
          '400': {
            $ref: '#/components/responses/ValidationError',
          },
          '403': {
            $ref: '#/components/responses/CsrfForbidden',
          },
          '404': {
            $ref: '#/components/responses/EmailVerificationDisabled',
          },
          '409': {
            $ref: '#/components/responses/AccountIdentifierConflict',
          },
          '429': {
            $ref: '#/components/responses/RateLimited',
          },
        },
      },
    },
    '/api/auth/password-reset/email-verification': {
      post: {
        tags: ['Auth'],
        summary: 'Send a password reset email verification code',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/SendPasswordResetEmailVerificationRequest',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Email verification send metadata',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/EmailVerificationSendResponse',
                },
              },
            },
          },
          '400': {
            $ref: '#/components/responses/ValidationError',
          },
          '403': {
            $ref: '#/components/responses/CsrfForbidden',
          },
          '404': {
            $ref: '#/components/responses/EmailVerificationDisabled',
          },
          '429': {
            $ref: '#/components/responses/RateLimited',
          },
        },
      },
    },
    '/api/auth/me/email-verification': {
      post: {
        tags: ['Auth'],
        summary: "Send the authenticated user's email verification code",
        security: [
          {
            accessCookieAuth: [],
          },
        ],
        responses: {
          '200': {
            description: 'Email verification send metadata',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/EmailVerificationSendResponse',
                },
              },
            },
          },
          '401': {
            $ref: '#/components/responses/AuthRequired',
          },
          '403': {
            $ref: '#/components/responses/CsrfForbidden',
          },
          '404': {
            $ref: '#/components/responses/EmailVerificationDisabled',
          },
          '409': {
            $ref: '#/components/responses/EmailAlreadyVerified',
          },
          '429': {
            $ref: '#/components/responses/RateLimited',
          },
        },
      },
    },
    '/api/auth/me/email-verification/confirm': {
      post: {
        tags: ['Auth'],
        summary: "Confirm the authenticated user's email verification code",
        security: [
          {
            accessCookieAuth: [],
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/VerifyProfileEmailRequest',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Updated authenticated user',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    {
                      $ref: '#/components/schemas/ApiSuccess',
                    },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          $ref: '#/components/schemas/AuthUser',
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          '400': {
            $ref: '#/components/responses/ValidationError',
          },
          '401': {
            $ref: '#/components/responses/AuthRequired',
          },
          '403': {
            $ref: '#/components/responses/CsrfForbidden',
          },
          '404': {
            $ref: '#/components/responses/EmailVerificationDisabled',
          },
          '429': {
            $ref: '#/components/responses/RateLimited',
          },
        },
      },
    },
    '/api/auth/me/phone-verification': {
      post: {
        tags: ['Auth'],
        summary: "Send the authenticated user's phone verification code",
        security: [
          {
            accessCookieAuth: [],
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/SendProfilePhoneVerificationRequest',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'SMS verification send metadata',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/EmailVerificationSendResponse',
                },
              },
            },
          },
          '400': {
            $ref: '#/components/responses/ValidationError',
          },
          '401': {
            $ref: '#/components/responses/AuthRequired',
          },
          '403': {
            $ref: '#/components/responses/CsrfForbidden',
          },
          '404': {
            $ref: '#/components/responses/SmsVerificationDisabled',
          },
          '409': {
            $ref: '#/components/responses/PhoneAlreadyVerified',
          },
          '429': {
            $ref: '#/components/responses/RateLimited',
          },
        },
      },
    },
    '/api/auth/me/phone-verification/confirm': {
      post: {
        tags: ['Auth'],
        summary: "Confirm the authenticated user's phone verification code",
        security: [
          {
            accessCookieAuth: [],
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/VerifyProfilePhoneRequest',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Updated authenticated user',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    {
                      $ref: '#/components/schemas/ApiSuccess',
                    },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          $ref: '#/components/schemas/AuthUser',
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          '400': {
            $ref: '#/components/responses/ValidationError',
          },
          '401': {
            $ref: '#/components/responses/AuthRequired',
          },
          '403': {
            $ref: '#/components/responses/CsrfForbidden',
          },
          '404': {
            $ref: '#/components/responses/SmsVerificationDisabled',
          },
          '409': {
            $ref: '#/components/responses/PhoneIdentifierConflict',
          },
          '429': {
            $ref: '#/components/responses/RateLimited',
          },
        },
      },
    },
    '/api/auth/password-reset': {
      post: {
        tags: ['Auth'],
        summary: 'Reset an account password',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ResetPasswordRequest',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Password reset result',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/PasswordResetResponse',
                },
              },
            },
          },
          '400': {
            $ref: '#/components/responses/ValidationError',
          },
          '403': {
            $ref: '#/components/responses/CsrfForbidden',
          },
          '404': {
            $ref: '#/components/responses/EmailVerificationDisabled',
          },
          '429': {
            $ref: '#/components/responses/RateLimited',
          },
        },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Authenticate an account',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/LoginRequest',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Authenticated browser session metadata; tokens are set in HttpOnly cookies',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/AuthSessionResponse',
                },
              },
            },
          },
          '400': {
            $ref: '#/components/responses/ValidationError',
          },
          '401': {
            $ref: '#/components/responses/InvalidCredentials',
          },
          '403': {
            $ref: '#/components/responses/CsrfForbidden',
          },
          '429': {
            $ref: '#/components/responses/RateLimited',
          },
        },
      },
    },
    '/api/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Return the authenticated user',
        security: [
          {
            accessCookieAuth: [],
          },
        ],
        responses: {
          '200': {
            description: 'Authenticated user',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    {
                      $ref: '#/components/schemas/ApiSuccess',
                    },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          $ref: '#/components/schemas/AuthUser',
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          '401': {
            $ref: '#/components/responses/AuthRequired',
          },
        },
      },
      patch: {
        tags: ['Auth'],
        summary: "Update the authenticated user's profile",
        security: [
          {
            accessCookieAuth: [],
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/UpdateCurrentUserRequest',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Updated authenticated user',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    {
                      $ref: '#/components/schemas/ApiSuccess',
                    },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          $ref: '#/components/schemas/AuthUser',
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          '400': {
            $ref: '#/components/responses/ValidationError',
          },
          '401': {
            $ref: '#/components/responses/AuthRequired',
          },
          '403': {
            $ref: '#/components/responses/CsrfForbidden',
          },
          '429': {
            $ref: '#/components/responses/RateLimited',
          },
        },
      },
    },
    '/api/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Refresh the authenticated session',
        security: [
          {
            refreshCookieAuth: [],
          },
        ],
        responses: {
          '200': {
            description: 'Refreshed browser session metadata; tokens are rotated in HttpOnly cookies',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/AuthSessionResponse',
                },
              },
            },
          },
          '401': {
            $ref: '#/components/responses/AuthRequired',
          },
          '403': {
            $ref: '#/components/responses/CsrfForbidden',
          },
        },
      },
    },
    '/api/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Clear the authenticated session',
        security: [
          {
            refreshCookieAuth: [],
          },
        ],
        responses: {
          '200': {
            description: 'Sign-out result',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    {
                      $ref: '#/components/schemas/ApiSuccess',
                    },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'object',
                          required: ['signedOut'],
                          properties: {
                            signedOut: {
                              type: 'boolean',
                              const: true,
                            },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          '403': {
            $ref: '#/components/responses/CsrfForbidden',
          },
        },
      },
    },
    '/api/auth/avatar': {
      post: {
        tags: ['Auth'],
        summary: "Upload the authenticated user's avatar",
        security: [
          {
            accessCookieAuth: [],
          },
        ],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                additionalProperties: false,
                required: ['avatar'],
                properties: {
                  avatar: {
                    type: 'string',
                    format: 'binary',
                    description: 'JPEG, PNG, WebP, or GIF image.',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Updated authenticated user',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    {
                      $ref: '#/components/schemas/ApiSuccess',
                    },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          $ref: '#/components/schemas/AuthUser',
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          '400': {
            $ref: '#/components/responses/ValidationError',
          },
          '401': {
            $ref: '#/components/responses/AuthRequired',
          },
          '403': {
            $ref: '#/components/responses/CsrfForbidden',
          },
          '413': {
            description: 'Uploaded file is too large',
          },
          '429': {
            $ref: '#/components/responses/RateLimited',
          },
        },
      },
    },
    '/api/auth/sso/config': {
      get: {
        tags: ['Auth'],
        summary: 'Return SSO authentication configuration',
        responses: {
          '200': {
            description: 'SSO authentication configuration',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    {
                      $ref: '#/components/schemas/ApiSuccess',
                    },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          $ref: '#/components/schemas/SsoConfig',
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
    },
    '/api/auth/sso/start': {
      get: {
        tags: ['Auth'],
        summary: 'Redirect to the configured SSO provider',
        parameters: [
          {
            name: 'redirect',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              description:
                'Same-origin application path. Absolute URLs, protocol-relative URLs, and backslashes are rejected.',
              example: '/dashboard',
            },
          },
          {
            name: 'providerId',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              pattern: '^[A-Za-z0-9][A-Za-z0-9_-]*$',
            },
          },
        ],
        responses: {
          '302': {
            description: 'Redirect to SSO provider authorization endpoint',
          },
          '400': {
            $ref: '#/components/responses/ValidationError',
          },
          '404': {
            $ref: '#/components/responses/SsoDisabled',
          },
        },
      },
    },
    '/api/auth/sso/bind/start': {
      get: {
        tags: ['Auth'],
        summary: 'Redirect an authenticated user to bind an SSO provider',
        security: [
          {
            accessCookieAuth: [],
          },
        ],
        parameters: [
          {
            name: 'redirect',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              example: '/profile',
            },
          },
          {
            name: 'providerId',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              pattern: '^[A-Za-z0-9][A-Za-z0-9_-]*$',
            },
          },
        ],
        responses: {
          '302': {
            description: 'Redirect to SSO provider authorization endpoint',
          },
          '400': {
            $ref: '#/components/responses/ValidationError',
          },
          '401': {
            $ref: '#/components/responses/AuthRequired',
          },
          '404': {
            $ref: '#/components/responses/SsoDisabled',
          },
        },
      },
    },
    '/api/auth/sso/identities': {
      get: {
        tags: ['Auth'],
        summary: 'List current user SSO identities',
        security: [
          {
            accessCookieAuth: [],
          },
        ],
        responses: {
          '200': {
            description: 'Current user SSO identities',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/SsoIdentityListResponse',
                },
              },
            },
          },
          '401': {
            $ref: '#/components/responses/AuthRequired',
          },
        },
      },
    },
    '/api/auth/sso/callback': {
      get: {
        tags: ['Auth'],
        summary: 'Handle the SSO provider authorization callback',
        parameters: [
          {
            name: 'code',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
            },
          },
          {
            name: 'state',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
            },
          },
          {
            name: 'error',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
            },
          },
          {
            name: 'error_description',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
            },
          },
        ],
        responses: {
          '302': {
            description:
              'Redirect to frontend callback URL with a short-lived handoff or bind token in the URL fragment',
          },
          '400': {
            $ref: '#/components/responses/ValidationError',
          },
          '401': {
            $ref: '#/components/responses/SsoFailed',
          },
          '404': {
            $ref: '#/components/responses/SsoDisabled',
          },
        },
      },
    },
    '/api/auth/sso/session': {
      post: {
        tags: ['Auth'],
        summary: 'Exchange an SSO handoff token for an authenticated session',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/SsoSessionRequest',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Authenticated browser session metadata; tokens are set in HttpOnly cookies',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/AuthSessionResponse',
                },
              },
            },
          },
          '400': {
            $ref: '#/components/responses/ValidationError',
          },
          '401': {
            $ref: '#/components/responses/SsoFailed',
          },
          '403': {
            $ref: '#/components/responses/CsrfForbidden',
          },
          '404': {
            $ref: '#/components/responses/SsoDisabled',
          },
        },
      },
    },
    '/api/auth/sso/account': {
      post: {
        tags: ['Auth'],
        summary: 'Create an account from an unbound SSO identity',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/SsoCreateAccountRequest',
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Authenticated browser session metadata; tokens are set in HttpOnly cookies',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/AuthSessionResponse',
                },
              },
            },
          },
          '400': {
            $ref: '#/components/responses/ValidationError',
          },
          '401': {
            $ref: '#/components/responses/SsoFailed',
          },
          '403': {
            $ref: '#/components/responses/CsrfForbidden',
          },
          '404': {
            $ref: '#/components/responses/SsoDisabled',
          },
          '409': {
            $ref: '#/components/responses/SsoBindConflict',
          },
          '429': {
            $ref: '#/components/responses/RateLimited',
          },
        },
      },
    },
    '/api/auth/sso/bind': {
      post: {
        tags: ['Auth'],
        summary: 'Bind an unbound SSO identity to an existing account',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/SsoBindAccountRequest',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Authenticated browser session metadata; tokens are set in HttpOnly cookies',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/AuthSessionResponse',
                },
              },
            },
          },
          '400': {
            $ref: '#/components/responses/ValidationError',
          },
          '401': {
            $ref: '#/components/responses/SsoBindUnauthorized',
          },
          '403': {
            $ref: '#/components/responses/CsrfForbidden',
          },
          '404': {
            $ref: '#/components/responses/SsoDisabled',
          },
          '409': {
            $ref: '#/components/responses/SsoBindConflict',
          },
          '429': {
            $ref: '#/components/responses/RateLimited',
          },
        },
      },
    },
    '/api/users/': {
      get: {
        tags: ['Users'],
        summary: 'List users and available roles',
        security: [
          {
            accessCookieAuth: [],
          },
        ],
        parameters: [
          {
            name: 'page',
            in: 'query',
            schema: {
              type: 'integer',
              minimum: 1,
              default: 1,
            },
          },
          {
            name: 'pageSize',
            in: 'query',
            schema: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
              default: 20,
            },
          },
        ],
        responses: {
          '200': {
            description: 'User directory',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/UserListResponse',
                },
              },
            },
          },
          '401': {
            $ref: '#/components/responses/AuthRequired',
          },
          '403': {
            $ref: '#/components/responses/Forbidden',
          },
        },
      },
    },
    '/api/users/{id}': {
      put: {
        tags: ['Users'],
        summary: 'Update a managed user',
        security: [
          {
            accessCookieAuth: [],
          },
        ],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
              format: 'uuid',
            },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/UpdateUserRequest',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Updated user',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    {
                      $ref: '#/components/schemas/ApiSuccess',
                    },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          $ref: '#/components/schemas/UserListItem',
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          '400': {
            $ref: '#/components/responses/ValidationError',
          },
          '401': {
            $ref: '#/components/responses/AuthRequired',
          },
          '403': {
            $ref: '#/components/responses/CsrfOrPermissionForbidden',
          },
          '404': {
            description: 'User or role was not found',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ApiFailure',
                },
              },
            },
          },
          '409': {
            description: 'User identifiers conflict, or the final ROOT assignment cannot be removed',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ApiFailure',
                },
              },
            },
          },
        },
      },
    },
    '/api/users/{id}/roles': {
      put: {
        tags: ['Users'],
        summary: 'Replace a user role assignment set',
        security: [
          {
            accessCookieAuth: [],
          },
        ],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
              format: 'uuid',
            },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/UpdateUserRolesRequest',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Updated user role assignments',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    {
                      $ref: '#/components/schemas/ApiSuccess',
                    },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          $ref: '#/components/schemas/UserListItem',
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          '400': {
            $ref: '#/components/responses/ValidationError',
          },
          '401': {
            $ref: '#/components/responses/AuthRequired',
          },
          '403': {
            $ref: '#/components/responses/CsrfOrPermissionForbidden',
          },
          '404': {
            description: 'User or role was not found',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ApiFailure',
                },
              },
            },
          },
          '409': {
            description: 'The final ROOT assignment cannot be removed',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ApiFailure',
                },
              },
            },
          },
        },
      },
    },
    '/api/health': {
      get: {
        tags: ['Health'],
        summary: 'Return service health',
        responses: {
          '200': {
            description: 'Service health',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    {
                      $ref: '#/components/schemas/ApiSuccess',
                    },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          $ref: '#/components/schemas/Health',
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
    },
    '/api/health/ready': {
      get: {
        tags: ['Health'],
        summary: 'Return service readiness',
        responses: {
          '200': {
            description: 'Service readiness',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    {
                      $ref: '#/components/schemas/ApiSuccess',
                    },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          $ref: '#/components/schemas/Readiness',
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          '503': {
            description: 'Service is not ready',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ApiFailure',
                },
              },
            },
          },
        },
      },
    },
    '/api/openapi.json': {
      get: {
        tags: ['Docs'],
        summary: 'Return the OpenAPI document',
        responses: {
          '200': {
            description: 'OpenAPI document',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                },
              },
            },
          },
        },
      },
    },
    '/api/docs': {
      get: {
        tags: ['Docs'],
        summary: 'Serve Swagger UI',
        responses: {
          '200': {
            description: 'Swagger UI HTML',
            content: {
              'text/html': {
                schema: {
                  type: 'string',
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      accessCookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'tilty_scaffold_access_token',
      },
      refreshCookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'tilty_scaffold_refresh_token',
      },
    },
    responses: {
      AuthRequired: {
        description: 'Authentication is required or invalid',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ApiFailure',
            },
          },
        },
      },
      Forbidden: {
        description: 'The authenticated user does not have the required permission',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ApiFailure',
            },
          },
        },
      },
      CsrfForbidden: {
        description: 'The unsafe request origin is missing or not allowed',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ApiFailure',
            },
          },
        },
      },
      CsrfOrPermissionForbidden: {
        description: 'The unsafe request origin is missing or not allowed, or the authenticated user lacks permission',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ApiFailure',
            },
          },
        },
      },
      AccountIdentifierConflict: {
        description: 'Email address or username already exists',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ApiFailure',
            },
          },
        },
      },
      EmailAlreadyVerified: {
        description: 'The authenticated user email address is already verified',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ApiFailure',
            },
          },
        },
      },
      EmailVerificationDisabled: {
        description: 'Email verification is disabled',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ApiFailure',
            },
          },
        },
      },
      PhoneAlreadyVerified: {
        description: 'The authenticated user phone number is already verified',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ApiFailure',
            },
          },
        },
      },
      PhoneIdentifierConflict: {
        description: 'Phone number already exists',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ApiFailure',
            },
          },
        },
      },
      InvalidCredentials: {
        description: 'The account identifier or password is invalid',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ApiFailure',
            },
          },
        },
      },
      SmsVerificationDisabled: {
        description: 'SMS verification is disabled',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ApiFailure',
            },
          },
        },
      },
      SsoBindUnauthorized: {
        description: 'The account credentials are invalid, or the SSO bind token is invalid or expired',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ApiFailure',
            },
            examples: {
              invalidCredentials: {
                summary: 'Invalid account credentials',
                value: {
                  code: 401,
                  error: 'AUTH_INVALID_CREDENTIALS',
                  message: 'The account identifier or password is invalid.',
                },
              },
              invalidToken: {
                summary: 'Invalid or consumed SSO bind token',
                value: {
                  code: 401,
                  error: 'AUTH_INVALID_TOKEN',
                  message: 'Authentication token is invalid.',
                },
              },
              expiredToken: {
                summary: 'Expired SSO bind token',
                value: {
                  code: 401,
                  error: 'AUTH_TOKEN_EXPIRED',
                  message: 'Authentication token has expired.',
                },
              },
            },
          },
        },
      },
      SsoDisabled: {
        description: 'SSO authentication is disabled',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ApiFailure',
            },
          },
        },
      },
      SsoFailed: {
        description: 'SSO authentication could not be completed',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ApiFailure',
            },
          },
        },
      },
      SsoBindConflict: {
        description: 'SSO identity or account binding conflicts with an existing record',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ApiFailure',
            },
          },
        },
      },
      SetupLocked: {
        description: 'Setup is locked because SETUP_LOCKED is true.',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ApiFailure',
            },
          },
        },
      },
      SetupForbidden: {
        description: 'Setup is locked, or the unsafe request origin is missing or not allowed',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ApiFailure',
            },
          },
        },
      },
      RateLimited: {
        description: 'Request rate limit exceeded',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ApiFailure',
            },
          },
        },
      },
      ValidationError: {
        description: 'Request fields are invalid',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ApiFailure',
            },
          },
        },
      },
    },
    schemas: {
      ApiFailure: {
        type: 'object',
        required: ['code', 'error', 'message'],
        properties: {
          code: {
            type: 'integer',
            example: 400,
          },
          error: {
            type: 'string',
            example: 'FIELD_VALIDATE_ERROR',
          },
          message: {
            type: 'string',
            example: 'Request fields are invalid.',
          },
          details: {},
        },
      },
      ApiSuccess: {
        type: 'object',
        required: ['code', 'error', 'data'],
        properties: {
          code: {
            type: 'integer',
            const: 200,
          },
          error: {
            type: 'null',
          },
          data: {},
        },
      },
      SetupEnvironment: {
        type: 'object',
        description:
          'Backend configuration values accepted during setup. All values are submitted as strings; profile array fields are transported as JSON strings and rendered as TOML table arrays in config.toml. Selected providers determine which values must be non-empty. SETUP_LOCKED is managed by the backend.',
        required: setupEnvironmentKeys,
        propertyNames: {
          enum: setupEnvironmentKeys,
        },
        additionalProperties: {
          type: 'string',
        },
      },
      SetupDefaults: {
        type: 'object',
        required: ['environment', 'environmentFileLoaded'],
        properties: {
          environment: {
            $ref: '#/components/schemas/SetupEnvironment',
          },
          environmentFileLoaded: {
            type: 'boolean',
            description: 'Whether an existing backend config.toml file was loaded.',
          },
        },
      },
      SetupAdministrator: {
        type: 'object',
        required: ['username', 'displayName', 'email', 'password', 'confirmPassword'],
        properties: {
          username: {
            type: 'string',
            minLength: 3,
            maxLength: 32,
            pattern: '^[A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?$',
          },
          displayName: {
            type: 'string',
            minLength: 2,
            maxLength: 64,
          },
          email: {
            type: 'string',
            format: 'email',
          },
          password: {
            type: 'string',
            minLength: 8,
            maxLength: 128,
          },
          confirmPassword: {
            type: 'string',
            minLength: 8,
            maxLength: 128,
          },
        },
      },
      SetupCompleteRequest: {
        type: 'object',
        required: ['environment'],
        properties: {
          administrator: {
            $ref: '#/components/schemas/SetupAdministrator',
            description: 'Required only when the selected database does not already contain available users.',
          },
          environment: {
            $ref: '#/components/schemas/SetupEnvironment',
          },
        },
      },
      SetupEnvironmentRequest: {
        type: 'object',
        required: ['environment'],
        properties: {
          environment: {
            $ref: '#/components/schemas/SetupEnvironment',
          },
          stepId: {
            type: 'string',
            enum: ['administrator', 'runtime', 'scheduler', 'security'],
            description: 'When provided, validates only the setup step represented by this identifier.',
          },
        },
      },
      SetupConnectionTestResponse: {
        allOf: [
          {
            $ref: '#/components/schemas/ApiSuccess',
          },
          {
            type: 'object',
            properties: {
              data: {
                type: 'object',
                required: ['connected', 'hasExistingUsers'],
                properties: {
                  connected: {
                    type: 'boolean',
                    const: true,
                  },
                  hasExistingUsers: {
                    type: 'boolean',
                  },
                },
              },
            },
          },
        ],
      },
      SetupCacheConnectionTestResponse: {
        allOf: [
          {
            $ref: '#/components/schemas/ApiSuccess',
          },
          {
            type: 'object',
            properties: {
              data: {
                type: 'object',
                required: ['connected', 'store'],
                properties: {
                  connected: {
                    type: 'boolean',
                    const: true,
                  },
                  store: {
                    type: 'string',
                    enum: ['memory', 'redis'],
                  },
                },
              },
            },
          },
        ],
      },
      SetupFileStorageConnectionTestResponse: {
        allOf: [
          {
            $ref: '#/components/schemas/ApiSuccess',
          },
          {
            type: 'object',
            properties: {
              data: {
                type: 'object',
                required: ['connected', 'driver'],
                properties: {
                  connected: {
                    type: 'boolean',
                    const: true,
                  },
                  driver: {
                    type: 'string',
                    enum: ['local', 'oss'],
                  },
                },
              },
            },
          },
        ],
      },
      SetupLoggingConnectionTestResponse: {
        allOf: [
          {
            $ref: '#/components/schemas/ApiSuccess',
          },
          {
            type: 'object',
            properties: {
              data: {
                type: 'object',
                required: ['connected', 'target'],
                properties: {
                  connected: {
                    type: 'boolean',
                    const: true,
                  },
                  target: {
                    type: 'string',
                    enum: ['console', 'local', 'sls'],
                  },
                },
              },
            },
          },
        ],
      },
      SetupEmailConnectionTestResponse: {
        allOf: [
          {
            $ref: '#/components/schemas/ApiSuccess',
          },
          {
            type: 'object',
            properties: {
              data: {
                type: 'object',
                required: ['connected', 'service'],
                properties: {
                  connected: {
                    type: 'boolean',
                    const: true,
                  },
                  service: {
                    type: 'string',
                    enum: ['off', 'smtp'],
                  },
                },
              },
            },
          },
        ],
      },
      SetupSmsConnectionTestResponse: {
        allOf: [
          {
            $ref: '#/components/schemas/ApiSuccess',
          },
          {
            type: 'object',
            properties: {
              data: {
                type: 'object',
                required: ['connected', 'service'],
                properties: {
                  connected: {
                    type: 'boolean',
                    const: true,
                  },
                  service: {
                    type: 'string',
                    enum: ['aliyun', 'off'],
                  },
                  profileCountryCodes: {
                    type: 'array',
                    items: {
                      type: 'string',
                      enum: ['+86', '+852', '+853'],
                    },
                  },
                },
              },
            },
          },
        ],
      },
      SetupSsoConnectionTestResponse: {
        allOf: [
          {
            $ref: '#/components/schemas/ApiSuccess',
          },
          {
            type: 'object',
            properties: {
              data: {
                type: 'object',
                required: ['connected', 'enabled'],
                properties: {
                  connected: {
                    type: 'boolean',
                    const: true,
                  },
                  enabled: {
                    type: 'boolean',
                  },
                  providerIds: {
                    type: 'array',
                    items: {
                      type: 'string',
                    },
                  },
                },
              },
            },
          },
        ],
      },
      SetupCompleteResponse: {
        allOf: [
          {
            $ref: '#/components/schemas/ApiSuccess',
          },
          {
            type: 'object',
            properties: {
              data: {
                type: 'object',
                required: ['administratorCreated', 'completed', 'restartRequired'],
                properties: {
                  administratorCreated: {
                    type: 'boolean',
                  },
                  completed: {
                    type: 'boolean',
                    const: true,
                  },
                  restartRequired: {
                    type: 'boolean',
                    const: true,
                  },
                },
              },
            },
          },
        ],
      },
      AuthSession: {
        type: 'object',
        required: ['accessTokenExpiresAt', 'refreshTokenExpiresAt', 'user'],
        properties: {
          accessTokenExpiresAt: {
            type: 'string',
            format: 'date-time',
          },
          refreshTokenExpiresAt: {
            type: 'string',
            format: 'date-time',
          },
          user: {
            $ref: '#/components/schemas/AuthUser',
          },
        },
      },
      AuthSessionResponse: {
        allOf: [
          {
            $ref: '#/components/schemas/ApiSuccess',
          },
          {
            type: 'object',
            properties: {
              data: {
                $ref: '#/components/schemas/AuthSession',
              },
            },
          },
        ],
      },
      UpdateCurrentUserRequest: {
        type: 'object',
        additionalProperties: false,
        required: ['displayName'],
        properties: {
          displayName: {
            type: 'string',
            minLength: 2,
            maxLength: 64,
          },
          phoneNumber: {
            type: ['string', 'null'],
            maxLength: 32,
            pattern: '^\\+[1-9]\\d{7,14}$',
            description:
              'Use null to clear an existing phone number. This endpoint rejects non-null phone numbers; binding or changing a phone number requires SMS verification.',
          },
        },
      },
      AuthUser: {
        type: 'object',
        required: ['username', 'displayName', 'email', 'emailVerified', 'phoneVerified', 'roles', 'permissions'],
        properties: {
          username: {
            type: 'string',
            minLength: 3,
            maxLength: 32,
          },
          displayName: {
            type: 'string',
            minLength: 2,
            maxLength: 64,
          },
          email: {
            type: 'string',
            format: 'email',
          },
          emailVerified: {
            type: 'boolean',
          },
          phoneNumber: {
            type: 'string',
            pattern: '^\\+[1-9]\\d{7,14}$',
          },
          phoneVerified: {
            type: 'boolean',
          },
          avatarUrl: {
            type: 'string',
            format: 'uri-reference',
          },
          roles: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['ROOT', 'USER_ADMIN', 'USER_LIST'],
            },
          },
          permissions: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['ROOT', 'USER_ADMIN', 'USER_LIST'],
            },
          },
        },
      },
      RoleSummary: {
        type: 'object',
        required: ['id', 'key', 'name', 'description', 'system', 'available', 'permissionKeys'],
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
          },
          key: {
            type: 'string',
          },
          name: {
            type: 'string',
          },
          description: {
            type: 'string',
          },
          system: {
            type: 'boolean',
          },
          available: {
            type: 'boolean',
          },
          permissionKeys: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
        },
      },
      UserListItem: {
        type: 'object',
        required: [
          'id',
          'username',
          'displayName',
          'email',
          'emailVerified',
          'phoneVerified',
          'available',
          'roles',
          'permissions',
          'createdAt',
          'updatedAt',
        ],
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
          },
          username: {
            type: 'string',
          },
          displayName: {
            type: 'string',
          },
          email: {
            type: 'string',
            format: 'email',
          },
          emailVerified: {
            type: 'boolean',
          },
          phoneNumber: {
            type: 'string',
            pattern: '^\\+[1-9]\\d{7,14}$',
          },
          phoneVerified: {
            type: 'boolean',
          },
          avatarUrl: {
            type: 'string',
            format: 'uri-reference',
          },
          available: {
            type: 'boolean',
          },
          roles: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
          permissions: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
          },
          updatedAt: {
            type: 'string',
            format: 'date-time',
          },
        },
      },
      UserListResponse: {
        allOf: [
          {
            $ref: '#/components/schemas/ApiSuccess',
          },
          {
            type: 'object',
            properties: {
              data: {
                type: 'object',
                required: ['pagination', 'roles', 'users'],
                properties: {
                  pagination: {
                    $ref: '#/components/schemas/PaginationMetadata',
                  },
                  roles: {
                    type: 'array',
                    items: {
                      $ref: '#/components/schemas/RoleSummary',
                    },
                  },
                  users: {
                    type: 'array',
                    items: {
                      $ref: '#/components/schemas/UserListItem',
                    },
                  },
                },
              },
            },
          },
        ],
      },
      PaginationMetadata: {
        type: 'object',
        required: ['page', 'pageSize', 'total', 'totalPages'],
        properties: {
          page: {
            type: 'integer',
            minimum: 1,
          },
          pageSize: {
            type: 'integer',
            minimum: 1,
            maximum: 100,
          },
          total: {
            type: 'integer',
            minimum: 0,
          },
          totalPages: {
            type: 'integer',
            minimum: 0,
          },
        },
      },
      UpdateUserRolesRequest: {
        type: 'object',
        required: ['roleKeys'],
        properties: {
          roleKeys: {
            type: 'array',
            maxItems: 50,
            items: {
              type: 'string',
              minLength: 1,
              maxLength: 64,
            },
          },
        },
      },
      UpdateUserRequest: {
        type: 'object',
        properties: {
          username: {
            type: 'string',
            minLength: 3,
            maxLength: 32,
          },
          displayName: {
            type: 'string',
            minLength: 2,
            maxLength: 64,
          },
          email: {
            type: 'string',
            format: 'email',
            maxLength: 255,
          },
          emailVerified: {
            type: 'boolean',
          },
          phoneNumber: {
            type: ['string', 'null'],
            maxLength: 32,
            pattern: '^\\+[1-9]\\d{7,14}$',
          },
          phoneVerified: {
            type: 'boolean',
          },
          password: {
            type: 'string',
            minLength: 8,
            maxLength: 128,
          },
          available: {
            type: 'boolean',
          },
          roleKeys: {
            type: 'array',
            maxItems: 50,
            items: {
              type: 'string',
              minLength: 1,
              maxLength: 64,
            },
          },
        },
      },
      AuthConfig: {
        type: 'object',
        required: [
          'passwordRecoveryEnabled',
          'phoneCountryCodes',
          'profileEmailVerificationEnabled',
          'registrationEmailVerificationRequired',
        ],
        properties: {
          passwordRecoveryEnabled: {
            type: 'boolean',
          },
          phoneCountryCodes: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['+86', '+852', '+853'],
            },
          },
          profileEmailVerificationEnabled: {
            type: 'boolean',
          },
          registrationEmailVerificationRequired: {
            type: 'boolean',
          },
        },
      },
      SendRegistrationEmailVerificationRequest: {
        type: 'object',
        required: ['email'],
        properties: {
          email: {
            type: 'string',
            format: 'email',
            maxLength: 255,
          },
        },
      },
      SendPasswordResetEmailVerificationRequest: {
        type: 'object',
        required: ['email'],
        properties: {
          email: {
            type: 'string',
            format: 'email',
            maxLength: 255,
          },
        },
      },
      SendProfilePhoneVerificationRequest: {
        type: 'object',
        required: ['phoneNumber'],
        properties: {
          phoneNumber: {
            type: 'string',
            maxLength: 32,
            pattern: '^\\+[1-9]\\d{7,14}$',
          },
        },
      },
      VerifyProfileEmailRequest: {
        type: 'object',
        required: ['emailVerificationCode'],
        properties: {
          emailVerificationCode: {
            type: 'string',
            pattern: '^\\d{6}$',
          },
        },
      },
      VerifyProfilePhoneRequest: {
        type: 'object',
        required: ['phoneNumber', 'phoneVerificationCode'],
        properties: {
          phoneNumber: {
            type: 'string',
            maxLength: 32,
            pattern: '^\\+[1-9]\\d{7,14}$',
          },
          phoneVerificationCode: {
            type: 'string',
            pattern: '^\\d{6}$',
          },
        },
      },
      EmailVerificationSendResponse: {
        allOf: [
          {
            $ref: '#/components/schemas/ApiSuccess',
          },
          {
            type: 'object',
            properties: {
              data: {
                type: 'object',
                required: ['cooldownSeconds', 'expiresInSeconds'],
                properties: {
                  cooldownSeconds: {
                    type: 'integer',
                    minimum: 1,
                  },
                  expiresInSeconds: {
                    type: 'integer',
                    minimum: 1,
                  },
                },
              },
            },
          },
        ],
      },
      SsoConfig: {
        type: 'object',
        required: ['enabled', 'loginEnabled', 'providers'],
        properties: {
          enabled: {
            type: 'boolean',
          },
          loginEnabled: {
            type: 'boolean',
          },
          providers: {
            type: 'array',
            items: {
              $ref: '#/components/schemas/SsoProvider',
            },
          },
        },
      },
      SsoProvider: {
        type: 'object',
        required: ['id', 'name', 'protocol', 'loginEnabled', 'bindingEnabled'],
        properties: {
          id: {
            type: 'string',
          },
          name: {
            type: 'string',
          },
          iconUrl: {
            type: 'string',
          },
          protocol: {
            type: 'string',
            enum: ['oauth2', 'oidc'],
          },
          loginEnabled: {
            type: 'boolean',
          },
          bindingEnabled: {
            type: 'boolean',
          },
        },
      },
      SsoIdentityListResponse: {
        allOf: [
          {
            $ref: '#/components/schemas/ApiSuccess',
          },
          {
            type: 'object',
            properties: {
              data: {
                type: 'object',
                required: ['identities'],
                properties: {
                  identities: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['providerId', 'providerName', 'providerSubject', 'email', 'createdAt'],
                      properties: {
                        providerId: {
                          type: 'string',
                        },
                        providerName: {
                          type: 'string',
                        },
                        providerSubject: {
                          type: 'string',
                        },
                        email: {
                          type: 'string',
                          format: 'email',
                        },
                        createdAt: {
                          type: 'string',
                          format: 'date-time',
                        },
                        iconUrl: {
                          type: 'string',
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      },
      SsoSessionRequest: {
        type: 'object',
        required: ['token'],
        properties: {
          token: {
            type: 'string',
          },
        },
      },
      SsoCreateAccountRequest: {
        type: 'object',
        required: ['username', 'displayName', 'password', 'confirmPassword', 'token'],
        properties: {
          username: {
            type: 'string',
            minLength: 3,
            maxLength: 32,
            pattern: '^[A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?$',
          },
          displayName: {
            type: 'string',
            minLength: 2,
            maxLength: 64,
          },
          password: {
            type: 'string',
            minLength: 8,
            maxLength: 128,
          },
          confirmPassword: {
            type: 'string',
            minLength: 8,
            maxLength: 128,
          },
          token: {
            type: 'string',
          },
        },
      },
      SsoBindAccountRequest: {
        type: 'object',
        required: ['identifier', 'password', 'token'],
        properties: {
          identifier: {
            type: 'string',
            description: 'Email address or username.',
            maxLength: 255,
          },
          password: {
            type: 'string',
            minLength: 8,
            maxLength: 128,
          },
          token: {
            type: 'string',
          },
        },
      },
      Health: {
        type: 'object',
        required: ['status', 'time'],
        properties: {
          status: {
            type: 'string',
            const: 'ok',
          },
          time: {
            type: 'string',
            format: 'date-time',
          },
        },
      },
      Readiness: {
        type: 'object',
        required: ['checks', 'status', 'time'],
        properties: {
          checks: {
            type: 'object',
            additionalProperties: {
              type: 'string',
              enum: ['error', 'ok'],
            },
          },
          status: {
            type: 'string',
            const: 'ok',
          },
          time: {
            type: 'string',
            format: 'date-time',
          },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['identifier', 'password'],
        properties: {
          identifier: {
            type: 'string',
            description: 'Email address or username.',
            maxLength: 255,
          },
          password: {
            type: 'string',
            minLength: 8,
            maxLength: 128,
          },
        },
      },
      RegisterRequest: {
        type: 'object',
        required: ['username', 'displayName', 'email', 'password', 'confirmPassword'],
        properties: {
          username: {
            type: 'string',
            minLength: 3,
            maxLength: 32,
            pattern: '^[A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?$',
          },
          displayName: {
            type: 'string',
            minLength: 2,
            maxLength: 64,
          },
          email: {
            type: 'string',
            format: 'email',
            maxLength: 255,
          },
          emailVerificationCode: {
            type: 'string',
            pattern: '^\\d{6}$',
          },
          password: {
            type: 'string',
            minLength: 8,
            maxLength: 128,
          },
          confirmPassword: {
            type: 'string',
            minLength: 8,
            maxLength: 128,
          },
        },
      },
      ResetPasswordRequest: {
        type: 'object',
        required: ['email', 'emailVerificationCode', 'password', 'confirmPassword'],
        properties: {
          email: {
            type: 'string',
            format: 'email',
            maxLength: 255,
          },
          emailVerificationCode: {
            type: 'string',
            pattern: '^\\d{6}$',
          },
          password: {
            type: 'string',
            minLength: 8,
            maxLength: 128,
          },
          confirmPassword: {
            type: 'string',
            minLength: 8,
            maxLength: 128,
          },
        },
      },
      PasswordResetResponse: {
        allOf: [
          {
            $ref: '#/components/schemas/ApiSuccess',
          },
          {
            type: 'object',
            properties: {
              data: {
                type: 'object',
                required: ['reset'],
                properties: {
                  reset: {
                    type: 'boolean',
                    const: true,
                  },
                },
              },
            },
          },
        ],
      },
    },
  },
} as const;
