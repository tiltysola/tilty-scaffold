import { type Middleware } from 'koa';
import { z } from 'zod';

import { ok } from '../../core/http';
import { getRequestLocale } from '../../middleware/locale';
import { type AccessControlService } from '../access-control/access-control.service';
import { type UserService } from '../users/user.service';
import { toUserListItem } from './admin-user.presenters';

const defaultUserPageSize = 20;
const maxUserPageSize = 100;
const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(maxUserPageSize).default(defaultUserPageSize),
});

export class AdminUserDirectoryController {
  constructor(
    private readonly userService: UserService,
    private readonly accessControl: AccessControlService,
  ) {}

  list: Middleware = async (ctx) => {
    const pagination = listUsersQuerySchema.parse(ctx.query);
    const result = await this.userService.listUsers(pagination);
    const users = result.users;
    const accessByUserId = await this.accessControl.getUsersAccess(users.map((user) => user.id));
    const locale = getRequestLocale(ctx);

    ctx.body = ok({
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / pagination.pageSize),
      },
      roles: await this.accessControl.listRoles(locale),
      users: users.map((user) => toUserListItem(user, accessByUserId.get(user.id))),
    });
  };
}
