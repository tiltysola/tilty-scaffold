import cors from '@koa/cors';
import Koa from 'koa';
import bodyParser from 'koa-bodyparser';

import { type BackendModule } from './core/module';
import { createRouter } from './core/router';
import { csrfProtectionMiddleware } from './middleware/csrf';
import { errorMiddleware } from './middleware/error';
import { requestIdMiddleware } from './middleware/request-id';
import { requestLogMiddleware } from './middleware/request-log';
import { securityHeadersMiddleware } from './middleware/security-headers';
import { type StaticFilesConfig, staticFilesMiddleware } from './middleware/static-files';

interface AppConfig {
  corsOrigins: string[];
  requestLogEnabled: boolean;
  staticFiles?: StaticFilesConfig;
  trustProxy: boolean;
}

const defaultAppConfig: AppConfig = {
  corsOrigins: ['http://localhost:8011'],
  requestLogEnabled: false,
  trustProxy: false,
};

export function createApp(modules: BackendModule[], config: AppConfig = defaultAppConfig) {
  const app = new Koa();
  const router = createRouter(modules);

  app.proxy = config.trustProxy;
  app.use(errorMiddleware());
  app.use(requestIdMiddleware());
  app.use(requestLogMiddleware(config.requestLogEnabled));
  app.use(securityHeadersMiddleware());
  app.use(
    cors({
      credentials: true,
      exposeHeaders: ['X-Request-Id'],
      origin: (ctx) => getCorsOrigin(ctx.get('origin'), config.corsOrigins),
    }),
  );
  app.use(csrfProtectionMiddleware({ allowedOrigins: config.corsOrigins }));
  if (config.staticFiles) {
    app.use(staticFilesMiddleware(config.staticFiles));
  }
  app.use(bodyParser({ jsonLimit: '2mb' }));
  app.use(router.routes());
  app.use(router.allowedMethods());

  return app;
}

function getCorsOrigin(requestOrigin: string, allowedOrigins: string[]) {
  if (!requestOrigin) {
    return '';
  }

  if (allowedOrigins.includes('*') || allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }

  return '';
}
