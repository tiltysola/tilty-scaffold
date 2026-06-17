import { ReadStream } from 'fs';

import { describe, expect, it } from 'vitest';

import { RouteDefinition } from '../src/core/module';
import { createDocsModule } from '../src/modules/docs';
import { createTestContext, runMiddleware } from './support/http';

describe('docs API', () => {
  const routes = createDocsModule().routes;

  it('returns the OpenAPI document', async () => {
    const context = await runMiddleware(getRoute('/openapi.json'), createTestContext());
    const body = context.body as OpenApiDocument;

    expect(body.openapi).toBe('3.1.0');
    expect(body.paths['/api/auth/login']).toBeDefined();
    expect(body.paths['/api/auth/register/email-verification']).toBeDefined();
    expect(body.paths['/api/auth/password-reset']).toBeDefined();
    expect(body.paths['/api/auth/password-reset/email-verification']).toBeDefined();
    expect(body.paths['/api/auth/sso/config']).toBeDefined();
    expect(body.paths['/api/auth/sso/start']).toBeDefined();
    expect(body.paths['/api/auth/sso/callback']).toBeDefined();
    expect(body.paths['/api/auth/sso/session']).toBeDefined();
    expect(body.paths['/api/auth/sso/account']).toBeDefined();
    expect(body.paths['/api/auth/sso/bind']).toBeDefined();
    expect(body.paths['/api/health']).toBeDefined();
    expect(body.paths['/api/health/ready']).toBeDefined();
  });

  it('returns Swagger UI HTML', async () => {
    const context = await runMiddleware(getRoute('/docs'), createTestContext());

    expect(context.type).toBe('html');
    expect(context.body).toContain('swagger-ui-bundle.js');
    expect(context.body).toContain('swagger-initializer.js');
    expect(context.body).not.toContain('SwaggerUIBundle({');
  });

  it('returns Swagger UI assets', async () => {
    const context = await runMiddleware(
      getRoute('/docs/:asset'),
      createTestContext(undefined, {}, { asset: 'swagger-ui.css' }),
    );

    expect(context.type).toContain('text/css');
    expect(context.body).toBeInstanceOf(ReadStream);
  });

  it('returns the Swagger UI initializer asset', async () => {
    const context = await runMiddleware(
      getRoute('/docs/:asset'),
      createTestContext(undefined, {}, { asset: 'swagger-initializer.js' }),
    );

    expect(context.type).toContain('application/javascript');
    expect(context.body).toContain("url: '/api/openapi.json'");
  });

  function getRoute(path: string) {
    const route = routes.find((item) => item.method === 'get' && item.path === path);

    if (!route) {
      throw new Error(`Missing docs route ${path}`);
    }

    return route.handlers[0]!;
  }
});

interface OpenApiDocument {
  openapi: string;
  paths: Record<string, unknown>;
}
