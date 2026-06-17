import { useCallback, useEffect, useMemo, useState } from 'react';

import { RefreshCwIcon, SaveIcon, ShieldCheckIcon } from 'lucide-react';
import { toast } from 'sonner';

import { getApiErrorMessage } from '@/lib/api';
import { getStoredSession } from '@/lib/auth';
import { fetchUsers, type RoleSummary, updateUserRoles, type UserListItem } from '@/lib/users';
import { Badge } from '@/shadcn/components/ui/badge';
import { Button } from '@/shadcn/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shadcn/components/ui/card';
import { Checkbox } from '@/shadcn/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shadcn/components/ui/table';
import { hasPermission, SystemPermission } from '@tilty/shared/access-control';

const Index = () => {
  const session = getStoredSession();
  const canManageUsers = hasPermission(session?.user.permissions, SystemPermission.UserAdmin);
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applyUserList = useCallback((result: Awaited<ReturnType<typeof fetchUsers>>) => {
    setUsers(result.users);
    setRoles(result.roles);
    setRoleDrafts(Object.fromEntries(result.users.map((user) => [user.id, user.roles])));
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      applyUserList(await fetchUsers());
    } catch (loadError) {
      setError(getApiErrorMessage(loadError, 'Users could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [applyUserList]);
  const availableRoles = useMemo(() => roles.filter((role) => role.available), [roles]);

  useEffect(() => {
    let active = true;

    fetchUsers()
      .then((result) => {
        if (active) {
          applyUserList(result);
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(getApiErrorMessage(loadError, 'Users could not be loaded.'));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [applyUserList]);

  const handleRoleToggle = (userId: string, roleKey: string, enabled: boolean) => {
    setRoleDrafts((current) => {
      const currentRoles = current[userId] ?? [];
      const nextRoles = enabled
        ? unique([...currentRoles, roleKey])
        : currentRoles.filter((currentRoleKey) => currentRoleKey !== roleKey);

      return {
        ...current,
        [userId]: nextRoles,
      };
    });
  };

  const handleSaveRoles = async (user: UserListItem) => {
    const roleKeys = roleDrafts[user.id] ?? [];

    setSavingUserId(user.id);

    try {
      const updatedUser = await updateUserRoles(user.id, roleKeys);

      setUsers((current) => current.map((item) => (item.id === updatedUser.id ? updatedUser : item)));
      setRoleDrafts((current) => ({
        ...current,
        [updatedUser.id]: updatedUser.roles,
      }));
      toast.success('User roles updated.');
    } catch (saveError) {
      toast.error(getApiErrorMessage(saveError, 'User roles could not be updated.'));
    } finally {
      setSavingUserId(null);
    }
  };

  return (
    <div className="grid gap-4 p-4 lg:p-6">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid gap-1">
            <CardTitle>Users</CardTitle>
            <CardDescription>User directory and role assignments.</CardDescription>
          </div>
          <Button variant="outline" onClick={() => void loadUsers()} disabled={loading}>
            <RefreshCwIcon />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <span>{error}</span>
              <Button size="sm" variant="outline" onClick={() => void loadUsers()}>
                Retry
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Permissions</TableHead>
                  <TableHead>Created</TableHead>
                  {canManageUsers ? <TableHead className="w-24 text-right">Action</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={canManageUsers ? 6 : 5} className="h-24 text-center text-muted-foreground">
                      Loading users
                    </TableCell>
                  </TableRow>
                ) : users.length ? (
                  users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="grid gap-1">
                          <span className="font-medium">{user.username}</span>
                          <span className="text-xs text-muted-foreground">{user.email}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.available ? 'secondary' : 'destructive'}>
                          {user.available ? 'Available' : 'Disabled'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {canManageUsers ? (
                          <RoleEditor
                            roles={availableRoles}
                            selectedRoleKeys={roleDrafts[user.id] ?? user.roles}
                            disabled={savingUserId === user.id}
                            onToggle={(roleKey, enabled) => handleRoleToggle(user.id, roleKey, enabled)}
                          />
                        ) : (
                          <KeyBadges keys={user.roles} emptyText="No roles" />
                        )}
                      </TableCell>
                      <TableCell>
                        <KeyBadges keys={user.permissions} emptyText="No permissions" />
                      </TableCell>
                      <TableCell>{formatDate(user.createdAt)}</TableCell>
                      {canManageUsers ? (
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            onClick={() => void handleSaveRoles(user)}
                            disabled={savingUserId === user.id || arraysEqual(roleDrafts[user.id] ?? [], user.roles)}
                          >
                            {savingUserId === user.id ? <ShieldCheckIcon /> : <SaveIcon />}
                            Save
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={canManageUsers ? 6 : 5} className="h-24 text-center text-muted-foreground">
                      No users found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const RoleEditor = ({
  disabled,
  onToggle,
  roles,
  selectedRoleKeys,
}: {
  disabled: boolean;
  onToggle: (roleKey: string, enabled: boolean) => void;
  roles: RoleSummary[];
  selectedRoleKeys: string[];
}) => {
  return (
    <div className="flex flex-wrap gap-3">
      {roles.map((role) => (
        <label key={role.key} className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={selectedRoleKeys.includes(role.key)}
            disabled={disabled}
            onCheckedChange={(checked: boolean | 'indeterminate') => onToggle(role.key, checked === true)}
          />
          <span>{role.name}</span>
        </label>
      ))}
    </div>
  );
};

const KeyBadges = ({ emptyText, keys }: { emptyText: string; keys: string[] }) => {
  if (!keys.length) {
    return <span className="text-sm text-muted-foreground">{emptyText}</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {keys.map((key) => (
        <Badge key={key} variant="outline">
          {key}
        </Badge>
      ))}
    </div>
  );
};

function unique(values: string[]) {
  return [...new Set(values)];
}

function arraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString();
}

export default Index;
