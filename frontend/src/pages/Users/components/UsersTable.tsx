import { useIntl } from 'react-intl';

import { ChevronLeftIcon, ChevronRightIcon, PencilIcon } from 'lucide-react';

import { type RoleSummary, type UserListItem, type UserListPagination } from '@/lib/users';
import { Badge } from '@/shadcn/components/ui/badge';
import { Button } from '@/shadcn/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shadcn/components/ui/table';

import { formatDate } from '../utils';
import { RoleBadges } from './RoleBadges';
import { VerifiedContact } from './VerifiedContact';

export function UsersTable({
  authConfigLoaded,
  canManageUser,
  canManageUsers,
  displayTotalPages,
  loading,
  onEditUser,
  onPageChange,
  page,
  pagination,
  roles,
  savingUserId,
  users,
}: {
  authConfigLoaded: boolean;
  canManageUser: (user: UserListItem) => boolean;
  canManageUsers: boolean;
  displayTotalPages: number;
  loading: boolean;
  onEditUser: (user: UserListItem) => void;
  onPageChange: (page: number) => void;
  page: number;
  pagination: UserListPagination;
  roles: RoleSummary[];
  savingUserId: string | null;
  users: UserListItem[];
}) {
  const intl = useIntl();

  return (
    <div className="grid gap-4">
      <Table className="min-w-max">
        <TableHeader>
          <TableRow>
            <TableHead>{intl.formatMessage({ id: 'users.user' })}</TableHead>
            <TableHead>{intl.formatMessage({ id: 'profile.email' })}</TableHead>
            <TableHead>{intl.formatMessage({ id: 'users.phone' })}</TableHead>
            <TableHead>{intl.formatMessage({ id: 'users.status' })}</TableHead>
            <TableHead>{intl.formatMessage({ id: 'users.roles' })}</TableHead>
            <TableHead>{intl.formatMessage({ id: 'users.created' })}</TableHead>
            {canManageUsers ? (
              <TableHead className="w-24 text-right">{intl.formatMessage({ id: 'users.action' })}</TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell className="h-24 text-center text-muted-foreground" colSpan={canManageUsers ? 7 : 6}>
                {intl.formatMessage({ id: 'users.loading' })}
              </TableCell>
            </TableRow>
          ) : users.length ? (
            users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <div className="grid gap-1">
                    <span className="font-medium">{user.displayName}</span>
                    <span className="text-xs text-muted-foreground">@{user.username}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <VerifiedContact
                    label={intl.formatMessage({ id: 'profile.email' })}
                    value={user.email}
                    verified={user.emailVerified}
                  />
                </TableCell>
                <TableCell>
                  <VerifiedContact
                    label={intl.formatMessage({ id: 'users.phone' })}
                    placeholder={!user.phoneNumber}
                    value={user.phoneNumber ?? intl.formatMessage({ id: 'common.not.bound' })}
                    verified={Boolean(user.phoneNumber && user.phoneVerified)}
                  />
                </TableCell>
                <TableCell>
                  <Badge variant={user.available ? 'secondary' : 'destructive'}>
                    {intl.formatMessage({ id: user.available ? 'users.available' : 'users.disabled' })}
                  </Badge>
                </TableCell>
                <TableCell>
                  <RoleBadges roleKeys={user.roles} roles={roles} />
                </TableCell>
                <TableCell>{formatDate(user.createdAt, intl.locale)}</TableCell>
                {canManageUsers ? (
                  <TableCell className="text-right">
                    <Button
                      disabled={savingUserId === user.id || !authConfigLoaded || !canManageUser(user)}
                      onClick={() => onEditUser(user)}
                      size="sm"
                      title={
                        canManageUser(user)
                          ? undefined
                          : intl.formatMessage({ id: 'users.action.admin.target.forbidden' })
                      }
                    >
                      <PencilIcon />
                      {intl.formatMessage({ id: 'common.edit' })}
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell className="h-24 text-center text-muted-foreground" colSpan={canManageUsers ? 7 : 6}>
                {intl.formatMessage({ id: 'users.empty' })}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-sm text-muted-foreground">
          {intl.formatMessage(
            { id: 'users.page.summary' },
            { page: pagination.page, total: pagination.total, totalPages: displayTotalPages },
          )}
        </span>
        <div className="flex items-center gap-2">
          <Button
            disabled={loading || pagination.page <= 1}
            onClick={() => onPageChange(Math.max(1, page - 1))}
            size="sm"
            variant="outline"
          >
            <ChevronLeftIcon />
            {intl.formatMessage({ id: 'common.previous' })}
          </Button>
          <Button
            disabled={loading || pagination.page >= displayTotalPages}
            onClick={() => onPageChange(page + 1)}
            size="sm"
            variant="outline"
          >
            {intl.formatMessage({ id: 'common.next' })}
            <ChevronRightIcon />
          </Button>
        </div>
      </div>
    </div>
  );
}
