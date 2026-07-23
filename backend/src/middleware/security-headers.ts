import { type Middleware } from 'koa';

interface SecurityHeadersOptions {
  resourceOrigins?: readonly string[];
}

export function securityHeadersMiddleware(options: SecurityHeadersOptions = {}): Middleware {
  const resourceOrigins = normalizeResourceOrigins(options.resourceOrigins ?? ['*']);
  const resourceSourceList = ["'self'", ...resourceOrigins].join(' ');
  const securityHeaders = {
    'Content-Security-Policy': [
      "default-src 'self'",
      "base-uri 'none'",
      `connect-src ${resourceSourceList}`,
      `font-src ${resourceSourceList}`,
      "form-action 'self'",
      "frame-ancestors 'none'",
      `img-src 'self' data: ${resourceOrigins.join(' ')}`.trim(),
      "object-src 'none'",
      "script-src 'self'",
      `style-src ${resourceSourceList} 'unsafe-inline'`,
    ].join('; '),
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), geolocation=(), microphone=()',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  };

  return async (ctx, next) => {
    for (const [name, value] of Object.entries(securityHeaders)) {
      ctx.set(name, value);
    }

    await next();
  };
}

function normalizeResourceOrigins(values: readonly string[]) {
  const normalized = values.flatMap((value) => {
    const source = value.trim();

    if (source === '*') {
      return ['*'];
    }

    try {
      const url = new URL(source);

      if (
        (url.protocol === 'http:' || url.protocol === 'https:') &&
        !url.username &&
        !url.password &&
        url.pathname === '/' &&
        !url.search &&
        !url.hash
      ) {
        return [url.origin];
      }
    } catch {
      // Invalid sources are ignored defensively. Runtime configuration validation reports them before startup.
    }

    return [];
  });

  return normalized.includes('*') ? ['*'] : [...new Set(normalized)];
}
