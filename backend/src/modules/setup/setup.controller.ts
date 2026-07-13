import { type Middleware } from 'koa';

import { ok } from '../../core/http';
import { type SetupService } from './setup.service';

export class SetupController {
  constructor(private readonly service: SetupService) {}

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

  testSms: Middleware = async (ctx) => {
    ctx.body = ok(await this.service.testSms(ctx.request.body));
  };

  testSso: Middleware = async (ctx) => {
    ctx.body = ok(await this.service.testSso(ctx.request.body));
  };

  complete: Middleware = async (ctx) => {
    ctx.status = 201;
    ctx.body = ok(await this.service.complete(ctx.request.body));
  };
}
