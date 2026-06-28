import { useCallback, useEffect, useMemo, useState } from 'react';

import { RefreshCwIcon } from 'lucide-react';
import { toast } from 'sonner';

import { useAuthenticatedSession } from '@/hooks/useAuth';
import { useVerificationGate, type VerificationGateSubmitInput } from '@/hooks/useVerificationGate';
import { getApiErrorMessage } from '@/lib/api';
import { fetchAuthConfig, type PhoneCountryCode } from '@/lib/auth';
import { getPhoneCountryCode, getPhoneLocalNumber } from '@/lib/phone';
import { fetchUsers, type RoleSummary, updateUser, type UserListItem, type UserListPagination } from '@/lib/users';
import { Button } from '@/shadcn/components/ui/button';
import { hasPermission, SystemPermission } from '@tilty/shared/access-control';

import { IdentityVerificationDialog } from '@/components/IdentityVerification';

import { EditUserDialog } from './components/EditUserDialog';
import { UsersTable } from './components/UsersTable';
import {
  arraysEqual,
  defaultEditUserForm,
  defaultPagination,
  type EditUserForm,
  parseEditUserForm,
  unique,
  userPageSize,
} from './utils';

const defaultProfileImageMaxBytes = 2 * 1024 * 1024;

const Index = () => {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<UserListPagination>(defaultPagination);
  const [editingUser, setEditingUser] = useState<UserListItem | null>(null);
  const [editingForm, setEditingForm] = useState<EditUserForm>(defaultEditUserForm);
  const [editingRoleKeys, setEditingRoleKeys] = useState<string[]>([]);
  const [phoneCountryCodes, setPhoneCountryCodes] = useState<PhoneCountryCode[]>([]);
  const [profileImageMaxBytes, setProfileImageMaxBytes] = useState(defaultProfileImageMaxBytes);
  const [profileEmailVerificationEnabled, setProfileEmailVerificationEnabled] = useState(false);
  const [authConfigLoaded, setAuthConfigLoaded] = useState(false);
  const [accessVerified, setAccessVerified] = useState(false);
  const [loading, setLoading] = useState(false);
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
      if (!accessVerified) {
        return;
      }

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
    [accessVerified, applyUserList, page],
  );
  const handleManagedUserChange = useCallback((updatedUser: UserListItem) => {
    setUsers((current) => current.map((user) => (user.id === updatedUser.id ? updatedUser : user)));
  }, []);

  const availableRoles = useMemo(() => roles.filter((role) => role.available), [roles]);
  const {
    clearError: clearVerificationError,
    confirmChallenge,
    dismissChallenge,
    error: verificationError,
    pendingChallenge,
    requestChallenge,
    requestPending,
    submitPending,
  } = useVerificationGate({ purpose: 'user_management' });
  const displayTotalPages = Math.max(pagination.totalPages, 1);
  const phoneBindingEnabled = phoneCountryCodes.length > 0;

  useEffect(() => {
    let isActive = true;

    void requestChallenge()
      .then((verified) => {
        if (!isActive) {
          return;
        }

        if (verified) {
          setAccessVerified(true);
        }
      })
      .catch((requestError: unknown) => {
        if (isActive) {
          setError(getApiErrorMessage(requestError, 'User management access could not be verified.'));
        }
      });

    return () => {
      isActive = false;
    };
  }, [requestChallenge]);

  useEffect(() => {
    if (!accessVerified) {
      return undefined;
    }

    let isActive = true;

    fetchUsers({ page, pageSize: userPageSize })
      .then((result) => {
        if (isActive) {
          applyUserList(result);
        }
      })
      .catch((loadError: unknown) => {
        if (isActive) {
          setError(getApiErrorMessage(loadError, 'Users could not be loaded.'));
        }
      })
      .finally(() => {
        if (isActive) {
          setLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [accessVerified, applyUserList, page]);

  useEffect(() => {
    if (!accessVerified) {
      return undefined;
    }

    let isActive = true;

    fetchAuthConfig()
      .then((config) => {
        if (isActive) {
          setPhoneCountryCodes(config.phoneCountryCodes);
          setProfileImageMaxBytes(config.fileUploadMaxBytes);
          setProfileEmailVerificationEnabled(config.profileEmailVerificationEnabled);
        }
      })
      .catch((requestError: unknown) => {
        if (isActive) {
          toast.error(getApiErrorMessage(requestError, 'Authentication configuration could not be loaded.'));
        }
      })
      .finally(() => {
        if (isActive) {
          setAuthConfigLoaded(true);
        }
      });

    return () => {
      isActive = false;
    };
  }, [accessVerified]);

  const handleConfirmVerification = async (input: VerificationGateSubmitInput) => {
    const verified = await confirmChallenge(input);

    if (verified) {
      setAccessVerified(true);
    }
  };

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
      gender: user.gender ?? '',
      birthday: user.birthday ?? '',
      bio: user.bio ?? '',
      location: user.location ?? '',
      websiteUrl: user.websiteUrl ?? '',
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
    setEditingForm(defaultEditUserForm);
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
    <div className="grid gap-6 p-4 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-normal">Users</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">User directory and role assignments.</p>
        </div>
        <Button className="shrink-0" variant="outline" onClick={() => void loadUsers()} disabled={loading}>
          <RefreshCwIcon />
          Refresh
        </Button>
      </div>
      {!accessVerified ? (
        <div className="flex min-h-64 items-center justify-center rounded-md border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          {error
            ? error
            : pendingChallenge
              ? 'Verify user management access to continue.'
              : requestPending
                ? 'Verifying user management access.'
                : 'User management verification is required.'}
        </div>
      ) : error ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <span>{error}</span>
          <Button size="sm" variant="outline" onClick={() => void loadUsers()}>
            <RefreshCwIcon />
            Retry
          </Button>
        </div>
      ) : (
        <UsersTable
          authConfigLoaded={authConfigLoaded}
          canManageUsers={canManageUsers}
          displayTotalPages={displayTotalPages}
          loading={loading}
          onEditUser={handleEditUser}
          onPageChange={handlePageChange}
          page={page}
          pagination={pagination}
          roles={roles}
          savingUserId={savingUserId}
          users={users}
        />
      )}
      <EditUserDialog
        availableRoles={availableRoles}
        editError={editError}
        editingDisabled={editingDisabled}
        editingForm={editingForm}
        editingRoleKeys={editingRoleKeys}
        editingUser={editingUser}
        emailVerifiedDisabled={emailVerifiedDisabled}
        onFormChange={setEditingForm}
        onManagedUserChange={handleManagedUserChange}
        onOpenChange={handleEditDialogOpenChange}
        onRoleToggle={handleRoleToggle}
        onSave={() => void handleSaveUser()}
        phoneBindingEnabled={phoneBindingEnabled}
        phoneCountryCodes={phoneCountryCodes}
        phoneDisabled={phoneDisabled}
        profileEmailVerificationEnabled={profileEmailVerificationEnabled}
        profileImageMaxBytes={profileImageMaxBytes}
        savingUserId={savingUserId}
      />
      {pendingChallenge ? (
        <IdentityVerificationDialog
          allowRecoveryCode
          defaultMethod={pendingChallenge.defaultMethod}
          error={verificationError}
          methods={pendingChallenge.methods}
          onClearError={clearVerificationError}
          onOpenChange={(open: boolean) => {
            if (!open) {
              dismissChallenge();
              setError('User management verification is required.');
            }
          }}
          onSubmit={handleConfirmVerification}
          open={Boolean(pendingChallenge)}
          pending={submitPending}
          title="Verify user management access"
        />
      ) : null}
    </div>
  );
};

export default Index;
