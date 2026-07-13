import { type Middleware } from 'koa';
import { z } from 'zod';

import { getRouteParams, ok } from '../../core/http';
import { getAuthRequestContext } from '../auth/auth.http';
import { apiKeyParamsSchema, getSessionAuth } from './api-key.helpers';
import { type ApiKeyService } from './api-key.service';

const apiKeyCreateSchema = z.object({
  name: z.string().trim().min(1).max(128),
  description: z
    .string()
    .trim()
    .max(512)
    .optional()
    .transform((value) => (value ? value : undefined)),
  expiresAt: z
    .string()
    .datetime()
    .optional()
    .transform((value) => (value ? value : undefined)),
});

export class ApiKeyController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  list: Middleware = async (ctx) => {
    const auth = getSessionAuth(ctx);

    ctx.body = ok(await this.apiKeyService.listForUser(auth.user.id));
  };

  create: Middleware = async (ctx) => {
    const auth = getSessionAuth(ctx);
    const input = apiKeyCreateSchema.parse(ctx.request.body);

    ctx.status = 201;
    ctx.body = ok(
      await this.apiKeyService.create(input, {
        actorUserId: auth.user.id,
        context: getAuthRequestContext(ctx),
        userId: auth.user.id,
      }),
    );
  };

  disable: Middleware = async (ctx) => {
    const auth = getSessionAuth(ctx);
    const { id } = apiKeyParamsSchema.parse(getRouteParams(ctx));

    ctx.body = ok(
      await this.apiKeyService.disable({
        actorUserId: auth.user.id,
        context: getAuthRequestContext(ctx),
        keyId: id,
        userId: auth.user.id,
      }),
    );
  };

  enable: Middleware = async (ctx) => {
    const auth = getSessionAuth(ctx);
    const { id } = apiKeyParamsSchema.parse(getRouteParams(ctx));

    ctx.body = ok(
      await this.apiKeyService.enable({
        actorUserId: auth.user.id,
        context: getAuthRequestContext(ctx),
        keyId: id,
        userId: auth.user.id,
      }),
    );
  };

  revoke: Middleware = async (ctx) => {
    const auth = getSessionAuth(ctx);
    const { id } = apiKeyParamsSchema.parse(getRouteParams(ctx));

    ctx.body = ok(
      await this.apiKeyService.revoke({
        actorUserId: auth.user.id,
        context: getAuthRequestContext(ctx),
        keyId: id,
        userId: auth.user.id,
      }),
    );
  };
}
