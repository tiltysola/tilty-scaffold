import { useCallback, useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';

import { RefreshCwIcon, ShieldAlertIcon } from 'lucide-react';
import { toast } from 'sonner';

import { useAuthenticatedSession } from '@/hooks/useAuth';
import { useVerificationGate, type VerificationGateSubmitInput } from '@/hooks/useVerificationGate';
import { getApiErrorMessage } from '@/lib/api';
import { fetchAuthConfig, type PhoneCountryCode } from '@/lib/auth';
import { getPhoneCountryCode, getPhoneLocalNumber } from '@/lib/phone';
import { fetchUsers, type RoleSummary, updateUser, type UserListItem, type UserListPagination } from '@/lib/users';
import { Button } from '@/shadcn/components/ui/button';
import { hasPermission, SystemPermission } from '@tilty/shared/access-control';

import { AppEmptyState } from '@/components/AppEmptyState';
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
  const intl = useIntl();
  const session = useAuthenticatedSession();
  const canManageUsers = hasPermission(session.user.permissions, SystemPermission.UserAdmin);

  const applyUserList = useCallback((result: Awaited<ReturnType<typeof fetchUsers>>) => {
    setUsers(result.users);
    setRoles(result.roles);
    setPagination(result.pagination);
  }, []);

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

  const loadUsers = async (targetPage = page) => {
    if (!accessVerified) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      applyUserList(await fetchUsers({ page: targetPage, pageSize: userPageSize }));
    } catch (loadError) {
      setError(getApiErrorMessage(loadError, intl.formatMessage({ id: 'users.load.failed' })));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isActive = true;

    void requestChallenge()
      .then((verified) => {
        if (!isActive) {
          return;
        }

        if (verified) {
          setLoading(true);
          setAccessVerified(true);
        }
      })
      .catch((requestError: unknown) => {
        if (isActive) {
          setError(getApiErrorMessage(requestError, intl.formatMessage({ id: 'users.access.verification.failed' })));
        }
      });

    return () => {
      isActive = false;
    };
  }, [intl, requestChallenge]);

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
          setError(getApiErrorMessage(loadError, intl.formatMessage({ id: 'users.load.failed' })));
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
  }, [accessVerified, applyUserList, intl, page]);

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
          toast.error(getApiErrorMessage(requestError, intl.formatMessage({ id: 'users.auth.config.load.failed' })));
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
  }, [accessVerified, intl]);

  const handleConfirmVerification = async (input: VerificationGateSubmitInput) => {
    const verified = await confirmChallenge(input);

    if (verified) {
      setLoading(true);
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
      setEditError(intl.formatMessage({ id: parsed.error ?? 'users.user.update.failed' }));
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
      toast.success(intl.formatMessage({ id: 'users.user.updated' }));
    } catch (saveError) {
      toast.error(getApiErrorMessage(saveError, intl.formatMessage({ id: 'users.user.update.failed' })));
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
          <h1 className="text-2xl font-semibold tracking-normal">{intl.formatMessage({ id: 'users.title' })}</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">{intl.formatMessage({ id: 'users.description' })}</p>
        </div>
        {accessVerified ? (
          <Button className="shrink-0" disabled={loading} onClick={() => void loadUsers()} variant="outline">
            <RefreshCwIcon />
            {intl.formatMessage({ id: 'common.refresh' })}
          </Button>
        ) : null}
      </div>
      {!accessVerified ? (
        <AppEmptyState
          className="min-h-64 p-0"
          description={
            error
              ? error
              : pendingChallenge
                ? intl.formatMessage({ id: 'users.verify.access.continue' })
                : requestPending
                  ? intl.formatMessage({ id: 'users.verifying.access' })
                  : intl.formatMessage({ id: 'users.verification.required' })
          }
          icon={<ShieldAlertIcon />}
          title={intl.formatMessage({ id: 'users.verify.access.title' })}
          tone="destructive"
        />
      ) : error ? (
        <AppEmptyState
          actions={
            <Button onClick={() => void loadUsers()} size="sm" variant="outline">
              <RefreshCwIcon />
              {intl.formatMessage({ id: 'common.retry' })}
            </Button>
          }
          className="min-h-64 p-0"
          description={error}
          icon={<ShieldAlertIcon />}
          title={intl.formatMessage({ id: 'users.verify.access.title' })}
          tone="destructive"
        />
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
              setError(intl.formatMessage({ id: 'users.verification.required' }));
            }
          }}
          onSubmit={handleConfirmVerification}
          open={Boolean(pendingChallenge)}
          pending={submitPending}
          title={intl.formatMessage({ id: 'users.verify.access.title' })}
        />
      ) : null}
    </div>
  );
};

export default Index;
