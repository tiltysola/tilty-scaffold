import { type Middleware } from 'koa';

import { getRouteParams, ok } from '../../core/http';
import { apiKeyParamsSchema, getSessionAuth } from '../api-keys/api-key.helpers';
import { type ApiKeyService } from '../api-keys/api-key.service';
import { getAuthRequestContext } from '../auth/auth.http';

export class AdminApiKeyController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  list: Middleware = async (ctx) => {
    ctx.body = ok(await this.apiKeyService.listForAdmin());
  };

  revoke: Middleware = async (ctx) => {
    const auth = getSessionAuth(ctx);
    const { id } = apiKeyParamsSchema.parse(getRouteParams(ctx));

    ctx.body = ok(
      await this.apiKeyService.revoke({
        actorUserId: auth.user.id,
        context: getAuthRequestContext(ctx),
        keyId: id,
      }),
    );
  };
}
