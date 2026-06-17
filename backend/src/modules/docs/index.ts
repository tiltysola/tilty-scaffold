import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { type Middleware } from 'koa';
import { join } from 'path';
import { getAbsoluteFSPath } from 'swagger-ui-dist';

import { AppError } from '../../core/errors';
import { type BackendModule } from '../../core/module';
import { openApiDocument } from './openapi';

const swaggerUiPath = getAbsoluteFSPath();
const swaggerAssets = new Map([
  ['swagger-ui-bundle.js', 'application/javascript; charset=utf-8'],
  ['swagger-ui-standalone-preset.js', 'application/javascript; charset=utf-8'],
  ['swagger-ui.css', 'text/css; charset=utf-8'],
  ['swagger-initializer.js', 'application/javascript; charset=utf-8'],
]);

const getOpenApiJson: Middleware = async (ctx) => {
  ctx.body = openApiDocument;
};

const getSwaggerUi: Middleware = async (ctx) => {
  ctx.type = 'html';
  ctx.body = renderSwaggerHtml();
};

const getSwaggerAsset: Middleware = async (ctx) => {
  const asset = ctx.params.asset;
  const contentType = asset ? swaggerAssets.get(asset) : undefined;

  if (!asset || !contentType) {
    throw new AppError('DOCS_ASSET_NOT_FOUND', 'The Swagger UI asset was not found.', 404);
  }

  ctx.type = contentType;

  if (asset === 'swagger-initializer.js') {
    ctx.body = renderSwaggerInitializer();
    return;
  }

  const assetPath = join(swaggerUiPath, asset);
  const assetStat = await stat(assetPath).catch(() => null);

  if (!assetStat?.isFile()) {
    throw new AppError('DOCS_ASSET_NOT_FOUND', 'The Swagger UI asset was not found.', 404);
  }

  ctx.body = createReadStream(assetPath);
};

export function createDocsModule(): BackendModule {
  return {
    name: 'docs',
    prefix: '/api',
    routes: [
      {
        method: 'get',
        path: '/openapi.json',
        handlers: [getOpenApiJson],
      },
      {
        method: 'get',
        path: '/docs',
        handlers: [getSwaggerUi],
      },
      {
        method: 'get',
        path: '/docs/:asset',
        handlers: [getSwaggerAsset],
      },
    ],
  };
}

function renderSwaggerHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Tilty Scaffold API Docs</title>
    <link rel="stylesheet" href="/api/docs/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="/api/docs/swagger-ui-bundle.js"></script>
    <script src="/api/docs/swagger-ui-standalone-preset.js"></script>
    <script src="/api/docs/swagger-initializer.js"></script>
  </body>
</html>`;
}

function renderSwaggerInitializer() {
  return `window.ui = SwaggerUIBundle({
  url: '/api/openapi.json',
  dom_id: '#swagger-ui',
  presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
  layout: 'StandaloneLayout'
});
`;
}
