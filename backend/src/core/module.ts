import { Middleware } from 'koa';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface RouteDefinition {
  method: HttpMethod;
  path: string;
  handlers: Middleware[];
}

export interface JobDefinition {
  name: string;
  rule: string;
  runOnStart?: boolean;
  handler: () => Promise<void> | void;
}

export interface BackendModule {
  name: string;
  prefix: string;
  routes: RouteDefinition[];
  jobs?: JobDefinition[];
}
