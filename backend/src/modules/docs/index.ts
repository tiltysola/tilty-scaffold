import { type BackendModule } from '../../core/module';
import { DocsController } from './docs.controller';

export function createDocsModule(): BackendModule {
  const controller = new DocsController();

  return {
    name: 'docs',
    prefix: '/api',
    routes: [
      {
        method: 'get',
        path: '/openapi.json',
        handlers: [controller.openApiJson],
      },
      {
        method: 'get',
        path: '/docs',
        handlers: [controller.swaggerUi],
      },
      {
        method: 'get',
        path: '/docs/:asset',
        handlers: [controller.swaggerAsset],
      },
    ],
  };
}
