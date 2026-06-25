import { useCallback, useEffect, useId, useMemo, useState } from 'react';

import {
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PencilIcon,
  RefreshCwIcon,
  SaveIcon,
  ShieldCheckIcon,
  XIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { useAuthenticatedSession } from '@/hooks/useAuth';
import { getApiErrorMessage } from '@/lib/api';
import { fetchAuthConfig, type PhoneCountryCode } from '@/lib/auth';
import {
  displayNameSchema,
  emailSchema,
  passwordSchema,
  phoneNumberSchema,
  usernameSchema,
} from '@/lib/auth-validation';
import {
  composePhoneNumber,
  formatPhoneCountryCode,
  getPhoneCountryCode,
  getPhoneLocalNumber,
  getPhonePlaceholder,
} from '@/lib/phone';
import {
  fetchUsers,
  type RoleSummary,
  updateUser,
  type UpdateUserInput,
  type UserListItem,
  type UserListPagination,
} from '@/lib/users';
import { Badge } from '@/shadcn/components/ui/badge';
import { Button } from '@/shadcn/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shadcn/components/ui/card';
import { Checkbox } from '@/shadcn/components/ui/checkbox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shadcn/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shadcn/components/ui/dropdown-menu';
import { Input } from '@/shadcn/components/ui/input';
import { Label } from '@/shadcn/components/ui/label';
import { Switch } from '@/shadcn/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shadcn/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shadcn/components/ui/tooltip';
import { hasPermission, SystemPermission } from '@tilty/shared/access-control';

import FormMessage from '@/components/FormMessage';

const userPageSize = 20;
const defaultPagination: UserListPagination = {
  page: 1,
  pageSize: userPageSize,
  total: 0,
  totalPages: 0,
};

interface EditUserForm {
  username: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  phoneCountryCode: PhoneCountryCode;
  phoneLocalNumber: string;
  phoneVerified: boolean;
  password: string;
  available: boolean;
}

const Index = () => {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<UserListPagination>(defaultPagination);
  const [editingUser, setEditingUser] = useState<UserListItem | null>(null);
  const [editingForm, setEditingForm] = useState<EditUserForm>({
    username: '',
    displayName: '',
    email: '',
    emailVerified: false,
    phoneCountryCode: '+86',
    phoneLocalNumber: '',
    phoneVerified: false,
    password: '',
    available: true,
  });
  const [editingRoleKeys, setEditingRoleKeys] = useState<string[]>([]);
  const [phoneCountryCodes, setPhoneCountryCodes] = useState<PhoneCountryCode[]>([]);
  const [profileEmailVerificationEnabled, setProfileEmailVerificationEnabled] = useState(false);
  const [authConfigLoaded, setAuthConfigLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const session = useAuthenticatedSession();
  const canManageUsers = hasPermission(session.user.permissions, SystemPermission.UserAdmin);

  const applyUserList = useCallback((result: Awaited<ReturnType<typeof fetchUsers>>) => {
    setUsers(result.users);
    setRoles(result.roles);
    setPagination(result.pagination);
  }, []);

  const loadUsers = useCallback(
    async (targetPage = page) => {
      setLoading(true);
      setError(null);

      try {
        applyUserList(await fetchUsers({ page: targetPage, pageSize: userPageSize }));
      } catch (loadError) {
        setError(getApiErrorMessage(loadError, 'Users could not be loaded.'));
      } finally {
        setLoading(false);
      }
    },
    [applyUserList, page],
  );
  const availableRoles = useMemo(() => roles.filter((role) => role.available), [roles]);
  const displayTotalPages = Math.max(pagination.totalPages, 1);
  const phoneBindingEnabled = phoneCountryCodes.length > 0;

  useEffect(() => {
    let active = true;

    fetchUsers({ page, pageSize: userPageSize })
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
  }, [applyUserList, page]);

  useEffect(() => {
    let active = true;

    fetchAuthConfig()
      .then((config) => {
        if (active) {
          setPhoneCountryCodes(config.phoneCountryCodes);
          setProfileEmailVerificationEnabled(config.profileEmailVerificationEnabled);
        }
      })
      .catch((requestError: unknown) => {
        if (active) {
          toast.error(getApiErrorMessage(requestError, 'Authentication configuration could not be loaded.'));
        }
      })
      .finally(() => {
        if (active) {
          setAuthConfigLoaded(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const handlePageChange = (nextPage: number) => {
    setLoading(true);
    setError(null);
    setPage(nextPage);
  };

  const handleEditUser = (user: UserListItem) => {
    const phoneCountryCode = getPhoneCountryCode(user.phoneNumber, phoneCountryCodes);

    setEditingUser(user);
    setEditingForm({
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      emailVerified: user.emailVerified,
      phoneCountryCode: phoneCountryCode ?? phoneCountryCodes[0] ?? '+86',
      phoneLocalNumber: getPhoneLocalNumber(user.phoneNumber, phoneCountryCode),
      phoneVerified: user.phoneVerified,
      password: '',
      available: user.available,
    });
    setEditingRoleKeys(user.roles);
    setEditError(null);
  };

  const handleRoleToggle = (roleKey: string, enabled: boolean) => {
    setEditingRoleKeys((currentRoles) =>
      enabled
        ? unique([...currentRoles, roleKey])
        : currentRoles.filter((currentRoleKey) => currentRoleKey !== roleKey),
    );
  };

  const handleEditDialogOpenChange = (open: boolean) => {
    if (open) {
      return;
    }

    setEditingUser(null);
    setEditingForm({
      username: '',
      displayName: '',
      email: '',
      emailVerified: false,
      phoneCountryCode: '+86',
      phoneLocalNumber: '',
      phoneVerified: false,
      password: '',
      available: true,
    });
    setEditingRoleKeys([]);
    setEditError(null);
  };

  const handleSaveUser = async () => {
    if (!editingUser) {
      return;
    }

    const parsed = parseEditUserForm(editingForm, editingUser, phoneBindingEnabled, profileEmailVerificationEnabled);

    if (!parsed.success) {
      setEditError(parsed.error);
      return;
    }

    const roleKeysChanged = !arraysEqual(editingRoleKeys, editingUser.roles);

    setSavingUserId(editingUser.id);
    setEditError(null);

    try {
      const updatedUser = await updateUser(editingUser.id, {
        ...parsed.data,
        ...(roleKeysChanged ? { roleKeys: editingRoleKeys } : {}),
      });

      setUsers((current) => current.map((item) => (item.id === updatedUser.id ? updatedUser : item)));
      setEditingUser(null);
      setEditingRoleKeys([]);
      toast.success('User updated.');
    } catch (saveError) {
      toast.error(getApiErrorMessage(saveError, 'User could not be updated.'));
    } finally {
      setSavingUserId(null);
    }
  };

  const editingDisabled = Boolean(editingUser && savingUserId === editingUser.id);
  const emailVerifiedDisabled = editingDisabled || !profileEmailVerificationEnabled;
  const phoneDisabled = editingDisabled || !phoneBindingEnabled;

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
            <div className="grid gap-4">
              <Table>
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
                      <TableCell colSpan={canManageUsers ? 7 : 6} className="h-24 text-center text-muted-foreground">
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
                          <VerifiedContact value={user.email} verified={user.emailVerified} label="Email" />
                        </TableCell>
                        <TableCell>
                          <VerifiedContact
                            value={user.phoneNumber ?? 'Not bound'}
                            placeholder={!user.phoneNumber}
                            verified={Boolean(user.phoneNumber && user.phoneVerified)}
                            label="Phone"
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
                              size="sm"
                              onClick={() => handleEditUser(user)}
                              disabled={savingUserId === user.id || !authConfigLoaded}
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
                      <TableCell colSpan={canManageUsers ? 7 : 6} className="h-24 text-center text-muted-foreground">
                        No users found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm text-muted-foreground">
                  Page {pagination.page} of {displayTotalPages} - {pagination.total} users
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={loading || pagination.page <= 1}
                    onClick={() => handlePageChange(Math.max(1, page - 1))}
                  >
                    <ChevronLeftIcon />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={loading || pagination.page >= displayTotalPages}
                    onClick={() => handlePageChange(page + 1)}
                  >
                    Next
                    <ChevronRightIcon />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog open={Boolean(editingUser)} onOpenChange={handleEditDialogOpenChange}>
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit user</DialogTitle>
            <DialogDescription>
              Update profile details, account status, and roles for {editingUser?.displayName ?? 'the selected user'}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="editUsername">Username</Label>
              <Input
                autoComplete="username"
                disabled={Boolean(editingUser && savingUserId === editingUser.id)}
                id="editUsername"
                onChange={(event) => setEditingForm((current) => ({ ...current, username: event.target.value }))}
                value={editingForm.username}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="editDisplayName">Display name</Label>
              <Input
                autoComplete="name"
                disabled={Boolean(editingUser && savingUserId === editingUser.id)}
                id="editDisplayName"
                onChange={(event) => setEditingForm((current) => ({ ...current, displayName: event.target.value }))}
                value={editingForm.displayName}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="editEmail">Email</Label>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                <Input
                  autoComplete="email"
                  disabled={editingDisabled}
                  id="editEmail"
                  onChange={(event) => {
                    const email = event.target.value;

                    setEditingForm((current) => ({
                      ...current,
                      email,
                      emailVerified: editingUser && email === editingUser.email ? editingUser.emailVerified : false,
                    }));
                  }}
                  type="email"
                  value={editingForm.email}
                />
                <ToggleControl
                  checked={editingForm.emailVerified}
                  disabled={emailVerifiedDisabled}
                  label="Email verified"
                  onCheckedChange={(checked) => setEditingForm((current) => ({ ...current, emailVerified: checked }))}
                  showLabel={false}
                  tooltip={getVerifiedStateTooltip(
                    'Email',
                    editingForm.emailVerified,
                    profileEmailVerificationEnabled
                      ? undefined
                      : 'cannot be changed because email verification is not configured.',
                  )}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="editPhoneLocalNumber">Phone</Label>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                <div className="flex gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild disabled={phoneDisabled}>
                      <Button className="w-24 shrink-0 justify-between" type="button" variant="outline">
                        {editingForm.phoneCountryCode}
                        <ChevronDownIcon />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="z-[60] min-w-56">
                      {phoneCountryCodes.map((countryCode) => (
                        <DropdownMenuItem
                          key={countryCode}
                          onSelect={() =>
                            setEditingForm((current) => {
                              const phoneNumber = composePhoneNumber({
                                ...current,
                                phoneCountryCode: countryCode,
                              });

                              return {
                                ...current,
                                phoneCountryCode: countryCode,
                                phoneVerified:
                                  editingUser && phoneNumber === (editingUser.phoneNumber ?? '')
                                    ? editingUser.phoneVerified
                                    : false,
                              };
                            })
                          }
                        >
                          {formatPhoneCountryCode(countryCode)}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Input
                    autoComplete="tel-national"
                    disabled={phoneDisabled}
                    id="editPhoneLocalNumber"
                    onChange={(event) => {
                      const phoneLocalNumber = event.target.value;

                      setEditingForm((current) => {
                        const phoneNumber = composePhoneNumber({
                          ...current,
                          phoneLocalNumber,
                        });

                        return {
                          ...current,
                          phoneLocalNumber,
                          phoneVerified:
                            editingUser && phoneNumber === (editingUser.phoneNumber ?? '')
                              ? editingUser.phoneVerified
                              : false,
                        };
                      });
                    }}
                    placeholder={
                      phoneBindingEnabled ? getPhonePlaceholder(editingForm.phoneCountryCode) : 'Not configured'
                    }
                    value={editingForm.phoneLocalNumber}
                  />
                </div>
                <ToggleControl
                  checked={editingForm.phoneVerified}
                  disabled={phoneDisabled || !editingForm.phoneLocalNumber.trim()}
                  label="Phone verified"
                  onCheckedChange={(checked) => setEditingForm((current) => ({ ...current, phoneVerified: checked }))}
                  showLabel={false}
                  tooltip={getVerifiedStateTooltip(
                    'Phone',
                    editingForm.phoneVerified,
                    !phoneBindingEnabled
                      ? 'cannot be changed because SMS verification is not configured.'
                      : editingForm.phoneLocalNumber.trim()
                        ? undefined
                        : 'requires a phone number before it can be marked verified.',
                  )}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="editPassword">Password</Label>
              <Input
                autoComplete="new-password"
                disabled={editingDisabled}
                id="editPassword"
                onChange={(event) => setEditingForm((current) => ({ ...current, password: event.target.value }))}
                placeholder="Leave blank to keep current password"
                type="password"
                value={editingForm.password}
              />
            </div>
            <div className="grid gap-2">
              <Label>Availability</Label>
              <ToggleControl
                checked={editingForm.available}
                disabled={editingDisabled}
                label={editingForm.available ? 'Available' : 'Disabled'}
                onCheckedChange={(checked) => setEditingForm((current) => ({ ...current, available: checked }))}
                tooltip={editingForm.available ? 'Available' : 'Disabled'}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Roles</Label>
            <RoleEditor
              disabled={editingDisabled}
              onToggle={handleRoleToggle}
              roles={availableRoles}
              selectedRoleKeys={editingRoleKeys}
            />
          </div>
          <FormMessage message={editError} variant="error" />
          <DialogFooter>
            <DialogClose asChild>
              <Button
                disabled={Boolean(editingUser && savingUserId === editingUser.id)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
            </DialogClose>
            <Button
              disabled={
                !editingUser ||
                savingUserId === editingUser.id ||
                (!isEditUserFormChanged(
                  editingForm,
                  editingUser,
                  phoneBindingEnabled,
                  profileEmailVerificationEnabled,
                ) &&
                  arraysEqual(editingRoleKeys, editingUser.roles))
              }
              onClick={() => void handleSaveUser()}
              type="button"
            >
              {editingUser && savingUserId === editingUser.id ? <ShieldCheckIcon /> : <SaveIcon />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

const VerifiedContact = ({
  label,
  placeholder = false,
  value,
  verified,
}: {
  label: string;
  placeholder?: boolean;
  value: string;
  verified: boolean;
}) => {
  return (
    <div className="flex items-center gap-2">
      <span className={`min-w-0 truncate text-sm ${placeholder ? 'text-muted-foreground/70' : ''}`}>{value}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full ${
              verified ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
            }`}
            tabIndex={0}
          >
            {verified ? <CheckIcon className="size-3.5" /> : <XIcon className="size-3.5" />}
            <span className="sr-only">{`${label} ${verified ? 'verified' : 'unverified'}`}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent>{`${label} ${verified ? 'verified' : 'unverified'}`}</TooltipContent>
      </Tooltip>
    </div>
  );
};

const ToggleControl = ({
  checked,
  disabled,
  label,
  onCheckedChange,
  showLabel = true,
  tooltip,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
  showLabel?: boolean;
  tooltip?: string;
}) => {
  const id = useId();
  const control = (
    <div className="flex items-center gap-2 text-sm">
      <Switch checked={checked} disabled={disabled} id={id} onCheckedChange={onCheckedChange} />
      <Label className={showLabel ? 'font-normal' : 'sr-only'} htmlFor={id}>
        {label}
      </Label>
    </div>
  );

  if (!tooltip) {
    return control;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="inline-flex w-fit">{control}</div>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
};

const RoleBadges = ({ roleKeys, roles }: { roleKeys: string[]; roles: RoleSummary[] }) => {
  if (!roleKeys.length) {
    return <span className="text-sm text-muted-foreground/70">No roles</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {roleKeys.map((roleKey) => {
        const permissions = roles.find((role) => role.key === roleKey)?.permissionKeys ?? [];

        return (
          <Tooltip key={roleKey}>
            <TooltipTrigger asChild>
              <span className="inline-flex" tabIndex={0}>
                <Badge variant="outline">{roleKey}</Badge>
              </span>
            </TooltipTrigger>
            <TooltipContent>{permissions.length ? permissions.join(', ') : 'No permissions'}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
};

function unique(values: string[]) {
  return [...new Set(values)];
}

function arraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function getVerifiedStateTooltip(label: string, verified: boolean, reason?: string) {
  const state = `${label} ${verified ? 'verified' : 'unverified'}`;

  return reason ? `${state} ${reason}` : state;
}

function isEditUserFormChanged(
  form: EditUserForm,
  user: UserListItem,
  phoneBindingEnabled: boolean,
  profileEmailVerificationEnabled: boolean,
) {
  const phoneNumber = phoneBindingEnabled ? composePhoneNumber(form) : (user.phoneNumber ?? '');

  return (
    form.username !== user.username ||
    form.displayName !== user.displayName ||
    form.email !== user.email ||
    (profileEmailVerificationEnabled && form.emailVerified !== user.emailVerified) ||
    (phoneBindingEnabled && phoneNumber !== (user.phoneNumber ?? '')) ||
    (phoneBindingEnabled && form.phoneVerified !== user.phoneVerified) ||
    form.password.length > 0 ||
    form.available !== user.available
  );
}

function parseEditUserForm(
  form: EditUserForm,
  user: UserListItem,
  phoneBindingEnabled: boolean,
  profileEmailVerificationEnabled: boolean,
):
  | {
      success: true;
      data: UpdateUserInput;
    }
  | {
      success: false;
      error: string;
    } {
  const data: UpdateUserInput = {};

  if (form.username !== user.username) {
    const username = usernameSchema.safeParse(form.username);

    if (!username.success) {
      return { success: false, error: username.error.issues[0]?.message ?? 'Username is invalid.' };
    }

    data.username = username.data;
  }

  if (form.displayName !== user.displayName) {
    const displayName = displayNameSchema.safeParse(form.displayName);

    if (!displayName.success) {
      return { success: false, error: displayName.error.issues[0]?.message ?? 'Display name is invalid.' };
    }

    data.displayName = displayName.data;
  }

  if (form.email !== user.email) {
    const email = emailSchema.safeParse(form.email);

    if (!email.success) {
      return { success: false, error: email.error.issues[0]?.message ?? 'Email is invalid.' };
    }

    data.email = email.data;
  }

  if (profileEmailVerificationEnabled && (data.email !== undefined || form.emailVerified !== user.emailVerified)) {
    data.emailVerified = form.emailVerified;
  }

  const phoneNumberDraft = phoneBindingEnabled ? composePhoneNumber(form) : (user.phoneNumber ?? '');

  if (phoneBindingEnabled && phoneNumberDraft !== (user.phoneNumber ?? '')) {
    if (phoneNumberDraft) {
      const phoneNumber = phoneNumberSchema.safeParse(phoneNumberDraft);

      if (!phoneNumber.success) {
        return { success: false, error: phoneNumber.error.issues[0]?.message ?? 'Phone number is invalid.' };
      }

      data.phoneNumber = phoneNumber.data;
    } else {
      data.phoneNumber = null;
    }
  }

  const nextPhoneNumber = data.phoneNumber !== undefined ? data.phoneNumber : (user.phoneNumber ?? null);

  if (phoneBindingEnabled && form.phoneVerified && !nextPhoneNumber) {
    return { success: false, error: 'Phone number is required before marking it verified.' };
  }

  if (phoneBindingEnabled && (data.phoneNumber !== undefined || form.phoneVerified !== user.phoneVerified)) {
    data.phoneVerified = form.phoneVerified;
  }

  if (form.password.length > 0) {
    const password = passwordSchema.safeParse(form.password);

    if (!password.success) {
      return { success: false, error: password.error.issues[0]?.message ?? 'Password is invalid.' };
    }

    data.password = password.data;
  }

  if (form.available !== user.available) {
    data.available = form.available;
  }

  return { success: true, data };
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString();
}

export default Index;
