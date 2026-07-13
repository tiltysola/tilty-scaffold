import { type Middleware } from 'koa';
import { z } from 'zod';

export const apiKeyIdSchema = z.string().trim().min(1).max(32);
export const apiKeyParamsSchema = z.object({
  id: apiKeyIdSchema,
});

export function getSessionAuth(ctx: Parameters<Middleware>[0]) {
  const auth = ctx.state.auth as { authMethod?: string; user?: { id?: string } } | undefined;

  if (auth?.authMethod !== 'session' || !auth.user?.id) {
    throw new Error('Session authentication is required before API Key management handlers.');
  }

  return auth as { authMethod: 'session'; user: { id: string } };
}
