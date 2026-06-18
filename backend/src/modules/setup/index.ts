import { type Middleware } from 'koa';

import { ok } from '../../core/http';
import { type BackendModule } from '../../core/module';
import { SetupService } from './setup.service';

export function createSetupModule(service: SetupService): BackendModule {
  const controller = new SetupController(service);

  return {
    name: 'setup',
    prefix: '/api/setup',
    routes: [
      {
        method: 'get',
        path: '/status',
        handlers: [controller.status],
      },
      {
        method: 'get',
        path: '/defaults',
        handlers: [controller.defaults],
      },
      {
        method: 'post',
        path: '/validate',
        handlers: [controller.validate],
      },
      {
        method: 'post',
        path: '/validate/environment',
        handlers: [controller.validateEnvironment],
      },
      {
        method: 'post',
        path: '/test/database',
        handlers: [controller.testDatabase],
      },
      {
        method: 'post',
        path: '/test/cache',
        handlers: [controller.testCache],
      },
      {
        method: 'post',
        path: '/test/file-storage',
        handlers: [controller.testFileStorage],
      },
      {
        method: 'post',
        path: '/test/logging',
        handlers: [controller.testLogging],
      },
      {
        method: 'post',
        path: '/test/email',
        handlers: [controller.testEmail],
      },
      {
        method: 'post',
        path: '/test/sso',
        handlers: [controller.testSso],
      },
      {
        method: 'post',
        path: '/complete',
        handlers: [controller.complete],
      },
    ],
  };
}

export function createLockedSetupModule() {
  return createSetupModule(new SetupService('locked'));
}

export function createSetupOnlyModule() {
  return createSetupModule(new SetupService('setup'));
}

class SetupController {
  constructor(private readonly service: SetupService) {}

  status: Middleware = async (ctx) => {
    ctx.body = ok(this.service.getStatus());
  };

  defaults: Middleware = async (ctx) => {
    ctx.body = ok(this.service.getDefaults());
  };

  validate: Middleware = async (ctx) => {
    ctx.body = ok(this.service.validate(ctx.request.body));
  };

  validateEnvironment: Middleware = async (ctx) => {
    ctx.body = ok(this.service.validateEnvironment(ctx.request.body));
  };

  testDatabase: Middleware = async (ctx) => {
    ctx.body = ok(await this.service.testDatabase(ctx.request.body));
  };

  testCache: Middleware = async (ctx) => {
    ctx.body = ok(await this.service.testCache(ctx.request.body));
  };

  testFileStorage: Middleware = async (ctx) => {
    ctx.body = ok(await this.service.testFileStorage(ctx.request.body));
  };

  testLogging: Middleware = async (ctx) => {
    ctx.body = ok(await this.service.testLogging(ctx.request.body));
  };

  testEmail: Middleware = async (ctx) => {
    ctx.body = ok(await this.service.testEmail(ctx.request.body));
  };

  testSso: Middleware = async (ctx) => {
    ctx.body = ok(await this.service.testSso(ctx.request.body));
  };

  complete: Middleware = async (ctx) => {
    ctx.status = 201;
    ctx.body = ok(await this.service.complete(ctx.request.body));
  };
}
