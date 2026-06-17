export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Tilty Scaffold API',
    version: '0.1.0',
  },
  servers: [
    {
      url: 'http://localhost:3000',
      description: 'Local backend',
    },
  ],
  tags: [
    {
      name: 'Auth',
      description: 'Authentication endpoints',
    },
    {
      name: 'Health',
      description: 'Service health endpoints',
    },
  ],
  paths: {
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
            description: 'Authenticated session',
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
          '409': {
            $ref: '#/components/responses/EmailExists',
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
          '404': {
            $ref: '#/components/responses/EmailVerificationDisabled',
          },
          '409': {
            $ref: '#/components/responses/EmailExists',
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
          '404': {
            $ref: '#/components/responses/EmailVerificationDisabled',
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
          '404': {
            $ref: '#/components/responses/EmailVerificationDisabled',
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
            description: 'Authenticated session',
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
        },
      },
    },
    '/api/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Return the authenticated user',
        security: [
          {
            bearerAuth: [],
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
              description: 'Same-origin application path. Absolute URLs, protocol-relative URLs, and backslashes are rejected.',
              example: '/dashboard',
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
        ],
        responses: {
          '302': {
            description: 'Redirect to frontend callback URL with a short-lived handoff or bind token',
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
            description: 'Authenticated session',
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
            description: 'Authenticated session',
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
          '404': {
            $ref: '#/components/responses/SsoDisabled',
          },
          '409': {
            $ref: '#/components/responses/SsoBindConflict',
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
            description: 'Authenticated session',
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
          '404': {
            $ref: '#/components/responses/SsoDisabled',
          },
          '409': {
            $ref: '#/components/responses/SsoBindConflict',
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
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
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
      EmailExists: {
        description: 'Email already exists',
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
      InvalidCredentials: {
        description: 'The email address or password is invalid',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ApiFailure',
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
      AuthSession: {
        type: 'object',
        required: ['accessToken', 'expiresAt', 'tokenType', 'user'],
        properties: {
          accessToken: {
            type: 'string',
          },
          expiresAt: {
            type: 'string',
            format: 'date-time',
          },
          tokenType: {
            type: 'string',
            const: 'Bearer',
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
      AuthUser: {
        type: 'object',
        required: ['id', 'username', 'email'],
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
          },
          username: {
            type: 'string',
            minLength: 2,
            maxLength: 32,
          },
          email: {
            type: 'string',
            format: 'email',
          },
        },
      },
      AuthConfig: {
        type: 'object',
        required: ['passwordRecoveryEnabled', 'registrationEmailVerificationRequired'],
        properties: {
          passwordRecoveryEnabled: {
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
        required: ['enabled'],
        properties: {
          enabled: {
            type: 'boolean',
          },
        },
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
        required: ['token', 'username', 'password', 'confirmPassword'],
        properties: {
          token: {
            type: 'string',
          },
          username: {
            type: 'string',
            minLength: 2,
            maxLength: 32,
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
      SsoBindAccountRequest: {
        type: 'object',
        required: ['token', 'email', 'password'],
        properties: {
          token: {
            type: 'string',
          },
          email: {
            type: 'string',
            format: 'email',
            maxLength: 255,
          },
          password: {
            type: 'string',
            minLength: 8,
            maxLength: 128,
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
        required: ['email', 'password'],
        properties: {
          email: {
            type: 'string',
            format: 'email',
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
        required: ['username', 'email', 'password', 'confirmPassword'],
        properties: {
          username: {
            type: 'string',
            minLength: 2,
            maxLength: 32,
          },
          email: {
            type: 'string',
            format: 'email',
            maxLength: 255,
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
          emailVerificationCode: {
            type: 'string',
            pattern: '^\\d{6}$',
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
