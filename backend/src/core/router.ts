import Router from '@koa/router';

import { type BackendModule, type RouteDefinition } from './module';

export function createRouter(modules: BackendModule[]) {
  const router = new Router();

  for (const module of modules) {
    for (const route of module.routes) {
      registerRoute(router, module.prefix, route);
    }
  }

  return router;
}

function registerRoute(router: Router, prefix: string, route: RouteDefinition) {
  const path = `${prefix}${route.path}`;

  switch (route.method) {
    case 'get':
      router.get(path, ...route.handlers);
      break;
    case 'post':
      router.post(path, ...route.handlers);
      break;
    case 'put':
      router.put(path, ...route.handlers);
      break;
    case 'patch':
      router.patch(path, ...route.handlers);
      break;
    case 'delete':
      router.delete(path, ...route.handlers);
      break;
  }
}
