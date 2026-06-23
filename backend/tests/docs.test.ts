import { ReadStream } from 'fs';
import { describe, expect, it } from 'vitest';

import { createDocsModule } from '../src/modules/docs';
import { createTestContext, getTestRouteHandler, runMiddleware } from './support/http';

describe('docs API', () => {
  const routes = createDocsModule().routes;

  it('returns the OpenAPI document', async () => {
    const context = await runMiddleware(getTestRouteHandler(routes, 'get', '/openapi.json'), createTestContext());
    const body = context.body as OpenApiDocument;

    expect(body.openapi).toBe('3.1.0');
    expect(body.servers[0]).toEqual({
      url: '/',
      description: 'Current origin',
    });
    expect(body.paths['/api/setup/defaults']).toBeDefined();
    expect(body.paths['/api/setup/status']).toBeUndefined();
    expect(body.paths['/api/auth/login']).toBeDefined();
    expect(body.paths['/api/auth/refresh']).toBeDefined();
    expect(body.paths['/api/auth/register/email-verification']).toBeDefined();
    expect(body.paths['/api/auth/password-reset']).toBeDefined();
    expect(body.paths['/api/auth/password-reset/email-verification']).toBeDefined();
    expect(body.paths['/api/auth/avatar']).toBeDefined();
    expect(body.paths['/api/auth/sso/config']).toBeDefined();
    expect(body.paths['/api/auth/sso/start']).toBeDefined();
    expect(body.paths['/api/auth/sso/callback']).toBeDefined();
    expect(body.paths['/api/auth/sso/session']).toBeDefined();
    expect(body.paths['/api/auth/sso/account']).toBeDefined();
    expect(body.paths['/api/auth/sso/bind']).toBeDefined();
    expect(body.paths['/api/auth/logout']).toBeDefined();
    expect(body.paths['/api/users/']).toBeDefined();
    expect(body.paths['/api/users/{id}/roles']).toBeDefined();
    expect(body.paths['/api/health']).toBeDefined();
    expect(body.paths['/api/health/ready']).toBeDefined();
    expect(body.paths['/api/openapi.json']).toBeDefined();
    expect(body.paths['/api/docs']).toBeDefined();

    expectResponseRefs(body, '/api/auth/register', 'post', {
      '400': 'ValidationError',
      '409': 'AccountIdentifierConflict',
      '429': 'RateLimited',
    });
    expectResponseRefs(body, '/api/auth/register/email-verification', 'post', {
      '400': 'ValidationError',
      '404': 'EmailVerificationDisabled',
      '409': 'AccountIdentifierConflict',
      '429': 'RateLimited',
    });
    expectResponseRefs(body, '/api/auth/login', 'post', {
      '400': 'ValidationError',
      '401': 'InvalidCredentials',
      '429': 'RateLimited',
    });
    expectResponseRefs(body, '/api/auth/password-reset', 'post', {
      '400': 'ValidationError',
      '404': 'EmailVerificationDisabled',
      '429': 'RateLimited',
    });
    expectResponseRefs(body, '/api/auth/me', 'get', {
      '401': 'AuthRequired',
    });
    expectResponseRefs(body, '/api/auth/me', 'patch', {
      '400': 'ValidationError',
      '401': 'AuthRequired',
      '429': 'RateLimited',
    });
    expectResponseRefs(body, '/api/auth/refresh', 'post', {
      '401': 'AuthRequired',
    });
    expectResponseRefs(body, '/api/auth/avatar', 'post', {
      '400': 'ValidationError',
      '401': 'AuthRequired',
      '429': 'RateLimited',
    });
    expectResponseRefs(body, '/api/auth/sso/start', 'get', {
      '400': 'ValidationError',
      '404': 'SsoDisabled',
    });
    expectResponseRefs(body, '/api/auth/sso/callback', 'get', {
      '400': 'ValidationError',
      '401': 'SsoFailed',
      '404': 'SsoDisabled',
    });
    expectResponseRefs(body, '/api/auth/sso/session', 'post', {
      '400': 'ValidationError',
      '401': 'SsoFailed',
      '404': 'SsoDisabled',
    });
    expectResponseRefs(body, '/api/auth/sso/account', 'post', {
      '400': 'ValidationError',
      '401': 'SsoFailed',
      '404': 'SsoDisabled',
      '409': 'SsoBindConflict',
      '429': 'RateLimited',
    });
    expectResponseRefs(body, '/api/auth/sso/bind', 'post', {
      '400': 'ValidationError',
      '401': 'SsoBindUnauthorized',
      '404': 'SsoDisabled',
      '409': 'SsoBindConflict',
      '429': 'RateLimited',
    });

    const ssoBindUnauthorized = body.components.responses.SsoBindUnauthorized;

    expect(ssoBindUnauthorized?.content['application/json'].examples).toMatchObject({
      invalidCredentials: {
        value: {
          error: 'AUTH_INVALID_CREDENTIALS',
        },
      },
      invalidToken: {
        value: {
          error: 'AUTH_INVALID_TOKEN',
        },
      },
      expiredToken: {
        value: {
          error: 'AUTH_TOKEN_EXPIRED',
        },
      },
    });

    const setupEnvironment = body.components.schemas.SetupEnvironment;
    const setupDefaults = body.components.schemas.SetupDefaults;

    expect(setupEnvironment).toBeDefined();
    expect(setupDefaults).toBeDefined();
    expect(setupEnvironment?.required).not.toContain('SETUP_LOCKED');
    expect(setupDefaults?.required).toEqual(['environment', 'environmentFileLoaded']);
  });

  it('returns Swagger UI HTML', async () => {
    const context = await runMiddleware(getTestRouteHandler(routes, 'get', '/docs'), createTestContext());

    expect(context.type).toBe('html');
    expect(context.body).toContain('swagger-ui-bundle.js');
    expect(context.body).toContain('swagger-initializer.js');
    expect(context.body).not.toContain('SwaggerUIBundle({');
  });

  it('returns Swagger UI assets', async () => {
    const context = await runMiddleware(
      getTestRouteHandler(routes, 'get', '/docs/:asset'),
      createTestContext(undefined, {}, { asset: 'swagger-ui.css' }),
    );

    expect(context.type).toContain('text/css');
    expect(context.body).toBeInstanceOf(ReadStream);
  });

  it('returns the Swagger UI initializer asset', async () => {
    const context = await runMiddleware(
      getTestRouteHandler(routes, 'get', '/docs/:asset'),
      createTestContext(undefined, {}, { asset: 'swagger-initializer.js' }),
    );

    expect(context.type).toContain('application/javascript');
    expect(context.body).toContain("url: '/api/openapi.json'");
  });
});

function expectResponseRefs(
  document: OpenApiDocument,
  path: string,
  method: OpenApiMethod,
  responseRefs: Record<string, string>,
) {
  const operation = document.paths[path]?.[method];

  expect(operation).toBeDefined();

  for (const [status, response] of Object.entries(responseRefs)) {
    expect(operation?.responses[status]).toEqual({
      $ref: `#/components/responses/${response}`,
    });
  }
}

interface OpenApiDocument {
  components: {
    responses: Record<string, OpenApiResponse | undefined>;
    schemas: Record<string, { required?: string[] } | undefined>;
  };
  openapi: string;
  paths: Record<string, OpenApiPathItem | undefined>;
  servers: Array<{
    description: string;
    url: string;
  }>;
}

type OpenApiMethod = 'get' | 'post';

interface OpenApiPathItem {
  get?: OpenApiOperation;
  post?: OpenApiOperation;
}

interface OpenApiOperation {
  responses: Record<string, unknown>;
}

interface OpenApiResponse {
  content: {
    'application/json': {
      examples?: Record<string, { value: { error: string } }>;
    };
  };
}
