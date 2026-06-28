import { ChevronLeftIcon, ChevronRightIcon, PencilIcon } from 'lucide-react';

import { type RoleSummary, type UserListItem, type UserListPagination } from '@/lib/users';
import { Badge } from '@/shadcn/components/ui/badge';
import { Button } from '@/shadcn/components/ui/button';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shadcn/components/ui/table';

import { HoverScrollArea } from '@/components/HoverScrollArea';

import { formatDate } from '../utils';
import { RoleBadges } from './RoleBadges';
import { VerifiedContact } from './VerifiedContact';

export function UsersTable({
  authConfigLoaded,
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
  return (
    <div className="grid gap-4">
      <HoverScrollArea className="w-full">
        <table className="w-full min-w-max caption-bottom text-sm">
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Created</TableHead>
              {canManageUsers ? <TableHead className="w-24 text-right">Action</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell className="h-24 text-center text-muted-foreground" colSpan={canManageUsers ? 7 : 6}>
                  Loading users
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
                    <VerifiedContact label="Email" value={user.email} verified={user.emailVerified} />
                  </TableCell>
                  <TableCell>
                    <VerifiedContact
                      label="Phone"
                      placeholder={!user.phoneNumber}
                      value={user.phoneNumber ?? 'Not bound'}
                      verified={Boolean(user.phoneNumber && user.phoneVerified)}
                    />
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.available ? 'secondary' : 'destructive'}>
                      {user.available ? 'Available' : 'Disabled'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <RoleBadges roleKeys={user.roles} roles={roles} />
                  </TableCell>
                  <TableCell>{formatDate(user.createdAt)}</TableCell>
                  {canManageUsers ? (
                    <TableCell className="text-right">
                      <Button
                        disabled={savingUserId === user.id || !authConfigLoaded}
                        onClick={() => onEditUser(user)}
                        size="sm"
                      >
                        <PencilIcon />
                        Edit
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell className="h-24 text-center text-muted-foreground" colSpan={canManageUsers ? 7 : 6}>
                  No users found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </table>
      </HoverScrollArea>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-sm text-muted-foreground">
          Page {pagination.page} of {displayTotalPages} - {pagination.total} users
        </span>
        <div className="flex items-center gap-2">
          <Button
            disabled={loading || pagination.page <= 1}
            onClick={() => onPageChange(Math.max(1, page - 1))}
            size="sm"
            variant="outline"
          >
            <ChevronLeftIcon />
            Previous
          </Button>
          <Button
            disabled={loading || pagination.page >= displayTotalPages}
            onClick={() => onPageChange(page + 1)}
            size="sm"
            variant="outline"
          >
            Next
            <ChevronRightIcon />
          </Button>
        </div>
      </div>
    </div>
  );
}
