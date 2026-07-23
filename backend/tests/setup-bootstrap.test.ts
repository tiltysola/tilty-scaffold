import { describe, expect, it } from 'vitest';

import { loadSetupRuntimeEnv } from '../src/setup-bootstrap';

describe('setup bootstrap runtime configuration', () => {
  it('binds setup mode to loopback by default', () => {
    const originalServerHost = process.env.SERVER_HOST;

    delete process.env.SERVER_HOST;

    try {
      expect(loadSetupRuntimeEnv()).toMatchObject({
        GLOBAL_RATE_LIMIT_MAX: 120,
        SERVER_HOST: '127.0.0.1',
        SETUP_REMOTE_ENABLED: 'false',
      });
    } finally {
      if (originalServerHost === undefined) {
        delete process.env.SERVER_HOST;
      } else {
        process.env.SERVER_HOST = originalServerHost;
      }
    }
  });

  it('requires an explicit remote flag and HTTPS origin for non-loopback setup', () => {
    withEnvironment(
      {
        APP_DOMAIN: 'http://setup.example.com',
        SERVER_HOST: '0.0.0.0',
        SETUP_REMOTE_ENABLED: undefined,
      },
      () => {
        expect(() => loadSetupRuntimeEnv()).toThrow('SETUP_REMOTE_ENABLED');
      },
    );
    withEnvironment(
      {
        APP_DOMAIN: 'http://setup.example.com',
        SERVER_HOST: '0.0.0.0',
        SERVER_TRUST_PROXY: 'true',
        SETUP_REMOTE_ENABLED: 'true',
      },
      () => {
        expect(() => loadSetupRuntimeEnv()).toThrow('HTTPS APP_DOMAIN');
      },
    );
    withEnvironment(
      {
        APP_DOMAIN: 'https://setup.example.com',
        APP_CSP_RESOURCE_ORIGINS: 'https://setup.example.com',
        SERVER_HOST: '0.0.0.0',
        SERVER_TRUST_PROXY: 'true',
        SETUP_REMOTE_ENABLED: 'true',
      },
      () => {
        expect(loadSetupRuntimeEnv().SERVER_HOST).toBe('0.0.0.0');
      },
    );
  });

  it('requires HTTPS CORS origins and an explicit CSP allowlist for remote setup', () => {
    withEnvironment(
      {
        APP_CORS_ORIGINS: 'https://admin.example.com',
        APP_CSP_RESOURCE_ORIGINS: undefined,
        APP_DOMAIN: 'https://setup.example.com',
        SERVER_HOST: '0.0.0.0',
        SERVER_TRUST_PROXY: 'true',
        SETUP_REMOTE_ENABLED: 'true',
      },
      () => {
        expect(() => loadSetupRuntimeEnv()).toThrow('explicit CSP resource origin allowlist');
      },
    );
    withEnvironment(
      {
        APP_CORS_ORIGINS: 'http://admin.example.com',
        APP_CSP_RESOURCE_ORIGINS: 'https://setup.example.com',
        APP_DOMAIN: 'https://setup.example.com',
        SERVER_HOST: '0.0.0.0',
        SERVER_TRUST_PROXY: 'true',
        SETUP_REMOTE_ENABLED: 'true',
      },
      () => {
        expect(() => loadSetupRuntimeEnv()).toThrow('HTTPS CORS origins');
      },
    );
    withEnvironment(
      {
        APP_CORS_ORIGINS: 'https://admin.example.com',
        APP_CSP_RESOURCE_ORIGINS: '*',
        APP_DOMAIN: 'https://setup.example.com',
        SERVER_HOST: '0.0.0.0',
        SERVER_TRUST_PROXY: 'true',
        SETUP_REMOTE_ENABLED: 'true',
      },
      () => {
        expect(() => loadSetupRuntimeEnv()).toThrow('wildcard CSP');
      },
    );
  });
});

function withEnvironment(values: Record<string, string | undefined>, action: () => void) {
  const originals = new Map(Object.keys(values).map((key) => [key, process.env[key]]));

  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    action();
  } finally {
    for (const [key, value] of originals) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}
