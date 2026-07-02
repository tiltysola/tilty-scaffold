import { type Dispatch, type SetStateAction, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';

import { SaveIcon } from 'lucide-react';
import { toast } from 'sonner';

import { getApiErrorMessage } from '@/lib/api';
import { type PhoneCountryCode, resolveAssetUrl } from '@/lib/auth';
import { createImageObjectUrl } from '@/lib/image-upload';
import {
  deleteUserPasskey,
  deleteUserSsoIdentity,
  disableUserTotp,
  fetchUserDetails,
  type ManagedUserDetails,
  type ManagedUserSecurity,
  revokeUserDeviceSession,
  revokeUserDeviceSessions,
  type RoleSummary,
  updateUserMfaSettings,
  type UserListItem,
} from '@/lib/users';
import { Button } from '@/shadcn/components/ui/button';
import { Spinner } from '@/shadcn/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shadcn/components/ui/tabs';

import {
  AppDialogBody,
  AppDialogClose,
  AppDialogContent,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogRoot,
} from '@/components/AppDialog';
import { ConfirmActionDialog } from '@/components/ConfirmActionDialog';
import ImageCropDialog from '@/components/ImageCropDialog';

import {
  type EditUserForm,
  getImageLabel,
  getImageRemovedMessageId,
  getImageUpdatedMessageId,
  getImageUploadDescription,
  getImageUploadTitle,
  haveSameRoleKeys,
  isEditUserFormChanged,
  userImageConfigs,
  type UserImageTarget,
} from '../utils';
import { AccountTab } from './AccountTab';
import { DevicesTab } from './DevicesTab';
import { EditUserDetailsBoundary } from './EditUserDetailsBoundary';
import { PermissionsTab } from './PermissionsTab';
import { ProfileTab } from './ProfileTab';
import { type PendingSecurityConfirmation, SecurityTab } from './SecurityTab';
import { SsoTab } from './SsoTab';

type UserDialogTab = 'account' | 'permissions' | 'profile' | 'security' | 'devices' | 'sso';

export function EditUserDialog({
  availableRoles,
  editError,
  editingDisabled,
  editingForm,
  editingRoleKeys,
  editingUser,
  emailVerifiedDisabled,
  onFormChange,
  onManagedUserChange,
  onOpenChange,
  onRoleToggle,
  onSave,
  phoneBindingEnabled,
  phoneCountryCodes,
  phoneDisabled,
  profileEmailVerificationEnabled,
  profileImageMaxBytes,
  savingUserId,
}: {
  availableRoles: RoleSummary[];
  editError: string | null;
  editingDisabled: boolean;
  editingForm: EditUserForm;
  editingRoleKeys: string[];
  editingUser: UserListItem | null;
  emailVerifiedDisabled: boolean;
  onFormChange: Dispatch<SetStateAction<EditUserForm>>;
  onManagedUserChange: (user: UserListItem) => void;
  onOpenChange: (open: boolean) => void;
  onRoleToggle: (roleKey: string, enabled: boolean) => void;
  onSave: () => void;
  phoneBindingEnabled: boolean;
  phoneCountryCodes: PhoneCountryCode[];
  phoneDisabled: boolean;
  profileEmailVerificationEnabled: boolean;
  profileImageMaxBytes: number;
  savingUserId: string | null;
}) {
  const [activeTab, setActiveTab] = useState<UserDialogTab>('account');
  const [managedDetails, setManagedDetails] = useState<ManagedUserDetails | null>(null);
  const [detailsError, setDetailsError] = useState<{ message: string; userId: string } | null>(null);
  const [devicePending, setDevicePending] = useState(false);
  const [securityPending, setSecurityPending] = useState(false);
  const [imageTarget, setImageTarget] = useState<UserImageTarget | null>(null);
  const [imageCropUrl, setImageCropUrl] = useState<string | null>(null);
  const [imagePreviewTarget, setImagePreviewTarget] = useState<UserImageTarget | null>(null);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageRemoving, setImageRemoving] = useState(false);
  const [pendingSecurityConfirmation, setPendingSecurityConfirmation] = useState<PendingSecurityConfirmation>(null);
  const intl = useIntl();
  const saving = Boolean(editingUser && savingUserId === editingUser.id);
  const changed = editingUser
    ? isEditUserFormChanged(editingForm, editingUser, phoneBindingEnabled, profileEmailVerificationEnabled) ||
      !haveSameRoleKeys(editingRoleKeys, editingUser.roles)
    : false;
  const rolesChanged = editingUser ? !haveSameRoleKeys(editingRoleKeys, editingUser.roles) : false;
  const sensitiveChanges = Boolean(
    editingUser &&
    (editingForm.password.trim() ||
      rolesChanged ||
      editingForm.available !== editingUser.available ||
      editingForm.emailVerified !== editingUser.emailVerified ||
      editingForm.phoneVerified !== editingUser.phoneVerified),
  );
  const editingUserId = editingUser?.id;
  const currentManagedDetails = managedDetails?.user.id === editingUserId ? managedDetails : null;
  const currentDetailsError = detailsError && detailsError.userId === editingUserId ? detailsError.message : null;
  const detailsLoading = Boolean(editingUserId && !currentManagedDetails && !currentDetailsError);
  const currentManagedUser = currentManagedDetails?.user ?? editingUser;
  const imageConfig = imageTarget ? userImageConfigs[imageTarget] : null;
  const imageBusy = imageUploading || imageRemoving;
  const imageUrl =
    currentManagedUser && imageConfig ? resolveAssetUrl(imageConfig.getUrl(currentManagedUser)) : undefined;
  const showSaveFooter = activeTab === 'account' || activeTab === 'permissions' || activeTab === 'profile';
  const saveButton = (
    <Button disabled={!editingUser || saving || !changed} onClick={sensitiveChanges ? undefined : onSave} type="button">
      {saving ? <Spinner /> : <SaveIcon />}
      {intl.formatMessage({ id: 'common.save.changes' })}
    </Button>
  );

  useEffect(() => {
    if (!editingUserId) {
      return;
    }

    let isActive = true;

    void fetchUserDetails(editingUserId)
      .then((details) => {
        if (isActive) {
          setManagedDetails(details);
          setDetailsError(null);
          onManagedUserChange(details.user);
        }
      })
      .catch((error: unknown) => {
        if (isActive) {
          setDetailsError({
            message: getApiErrorMessage(error, intl.formatMessage({ id: 'users.edit.details.load.failed' })),
            userId: editingUserId,
          });
        }
      });

    return () => {
      isActive = false;
    };
  }, [editingUserId, intl, onManagedUserChange]);

  useEffect(() => {
    return () => {
      if (imageCropUrl) {
        URL.revokeObjectURL(imageCropUrl);
      }
    };
  }, [imageCropUrl]);

  const applyManagedDetails = (details: ManagedUserDetails) => {
    setManagedDetails(details);
    setDetailsError(null);
    onManagedUserChange(details.user);
  };

  const applyManagedSecurity = (security: ManagedUserSecurity) => {
    setManagedDetails((current) => (current ? { ...current, security } : current));
  };

  const handleReloadDetails = async () => {
    if (!editingUser) {
      return;
    }

    setDetailsError(null);
    setManagedDetails(null);

    try {
      const details = await fetchUserDetails(editingUser.id);

      applyManagedDetails(details);
    } catch (error) {
      setDetailsError({
        message: getApiErrorMessage(error, intl.formatMessage({ id: 'users.edit.details.load.failed' })),
        userId: editingUser.id,
      });
    }
  };

  const handleSecurityUpdate = async (
    request: (userId: string) => Promise<ManagedUserSecurity>,
    successMessage: string,
  ) => {
    if (!editingUser) {
      return;
    }

    setSecurityPending(true);

    try {
      applyManagedSecurity(await request(editingUser.id));
      toast.success(successMessage);
    } catch (error) {
      toast.error(getApiErrorMessage(error, intl.formatMessage({ id: 'users.edit.security.update.failed' })));
    } finally {
      setSecurityPending(false);
    }
  };

  const handleRevokeDevice = async (sessionId: string) => {
    if (!editingUser) {
      return;
    }

    setDevicePending(true);

    try {
      await revokeUserDeviceSession(editingUser.id, sessionId);
      setManagedDetails((current) =>
        current && current.user.id === editingUser.id
          ? {
              ...current,
              devices: current.devices.filter((device) => device.id !== sessionId),
            }
          : current,
      );
      toast.success(intl.formatMessage({ id: 'security.session.revoked' }));
    } catch (error) {
      toast.error(getApiErrorMessage(error, intl.formatMessage({ id: 'security.device.session.revoke.failed' })));
    } finally {
      setDevicePending(false);
    }
  };

  const handleRevokeDevices = async () => {
    if (!editingUser) {
      return;
    }

    setDevicePending(true);

    try {
      await revokeUserDeviceSessions(editingUser.id);
      setManagedDetails((current) =>
        current && current.user.id === editingUser.id
          ? {
              ...current,
              devices: current.devices.filter((device) => device.isCurrent),
            }
          : current,
      );
      toast.success(intl.formatMessage({ id: 'users.edit.devices.revoked' }));
    } catch (error) {
      toast.error(getApiErrorMessage(error, intl.formatMessage({ id: 'security.device.sessions.revoke.failed' })));
    } finally {
      setDevicePending(false);
    }
  };

  const handleTwoStepEnabledChange = (enabled: boolean) =>
    handleSecurityUpdate(
      (userId) => updateUserMfaSettings(userId, { enabled }),
      intl.formatMessage({
        id: enabled ? 'security.two.step.authentication.enabled' : 'security.two.step.authentication.disabled',
      }),
    );

  const handleSsoRequirementChange = (requiredForSso: boolean) =>
    handleSecurityUpdate(
      (userId) => updateUserMfaSettings(userId, { requiredForSso }),
      intl.formatMessage({ id: requiredForSso ? 'security.sso.mfa.enabled' : 'security.sso.mfa.disabled' }),
    );

  const handleDisableTotp = () =>
    handleSecurityUpdate(
      (userId) => disableUserTotp(userId),
      intl.formatMessage({ id: 'security.authenticator.app.removed' }),
    );

  const handleDeletePasskey = (passkeyId: string) =>
    handleSecurityUpdate(
      (userId) => deleteUserPasskey(userId, passkeyId),
      intl.formatMessage({ id: 'security.passkey.removed' }),
    );

  const handleDeleteSsoIdentity = async (providerId: string) => {
    if (!editingUser) {
      return;
    }

    setSecurityPending(true);

    try {
      const result = await deleteUserSsoIdentity(editingUser.id, providerId);

      setManagedDetails((current) => (current ? { ...current, ssoIdentities: result.identities } : current));
      toast.success(intl.formatMessage({ id: 'users.edit.sso.binding.removed' }));
    } catch (error) {
      toast.error(getApiErrorMessage(error, intl.formatMessage({ id: 'users.edit.sso.binding.remove.failed' })));
    } finally {
      setSecurityPending(false);
    }
  };

  const handleOpenImageDialog = (target: UserImageTarget) => {
    setImageTarget(target);
    setImageUploadError(null);
    setImageCropUrl(null);
  };

  const handleImageSelect = (file: File) => {
    const objectUrl = createImageObjectUrl(
      file,
      setImageUploadError,
      intl.formatMessage({ id: 'profile.image.type.error' }),
    );

    setImageCropUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }

      return objectUrl;
    });
  };

  const resetImageDialog = () => {
    setImageCropUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }

      return null;
    });
    setImageUploadError(null);
  };

  const handleImageDialogOpenChange = (open: boolean) => {
    if (open || imageBusy) {
      return;
    }

    setImageTarget(null);
    resetImageDialog();
  };

  const handleDialogOpenChange = (open: boolean) => {
    if (!open) {
      setActiveTab('account');
      setManagedDetails(null);
      setDetailsError(null);
      setImageTarget(null);
      setImagePreviewTarget(null);
      resetImageDialog();
    }

    onOpenChange(open);
  };

  const handleDialogInteractOutside = (event: { preventDefault: () => void }) => {
    if (imagePreviewTarget) {
      event.preventDefault();
    }
  };

  const handleImageSubmit = async (file: File) => {
    if (!editingUser || !imageConfig) {
      return;
    }

    setImageUploading(true);
    setImageUploadError(null);

    try {
      applyManagedDetails(await imageConfig.upload(editingUser.id, file));
      setImageTarget(null);
      resetImageDialog();
      toast.success(intl.formatMessage({ id: getImageUpdatedMessageId(imageTarget) }));
    } catch (error) {
      const message = getApiErrorMessage(
        error,
        intl.formatMessage({ id: 'profile.image.upload.failed' }, { label: getImageLabel(imageTarget, intl) }),
      );

      setImageUploadError(message);
      toast.error(message);
    } finally {
      setImageUploading(false);
    }
  };

  const handleImageRemove = async () => {
    if (!editingUser || !imageConfig) {
      return;
    }

    setImageRemoving(true);
    setImageUploadError(null);

    try {
      applyManagedDetails(await imageConfig.remove(editingUser.id));
      setImageTarget(null);
      resetImageDialog();
      toast.success(intl.formatMessage({ id: getImageRemovedMessageId(imageTarget) }));
    } catch (error) {
      const message = getApiErrorMessage(
        error,
        intl.formatMessage({ id: 'profile.image.remove.failed' }, { label: getImageLabel(imageTarget, intl) }),
      );

      setImageUploadError(message);
      toast.error(message);
    } finally {
      setImageRemoving(false);
    }
  };

  return (
    <>
      <AppDialogRoot open={Boolean(editingUser)} onOpenChange={handleDialogOpenChange}>
        <AppDialogContent className="sm:max-w-2xl" onInteractOutside={handleDialogInteractOutside}>
          <AppDialogHeader
            description={intl.formatMessage(
              { id: 'users.edit.dialog.description' },
              {
                name:
                  currentManagedUser?.displayName ?? intl.formatMessage({ id: 'users.edit.selected.user.fallback' }),
              },
            )}
            title={intl.formatMessage({ id: 'users.edit.dialog.title' })}
          />
          <AppDialogBody>
            <Tabs value={activeTab} onValueChange={(value: string) => setActiveTab(value as UserDialogTab)}>
              <TabsList className="h-auto w-full flex-wrap justify-start" variant="line">
                <TabsTrigger value="account">{intl.formatMessage({ id: 'users.edit.account.tab' })}</TabsTrigger>
                <TabsTrigger value="permissions">
                  {intl.formatMessage({ id: 'users.edit.permissions.tab' })}
                </TabsTrigger>
                <TabsTrigger value="profile">{intl.formatMessage({ id: 'users.edit.profile.tab' })}</TabsTrigger>
                <TabsTrigger value="security">{intl.formatMessage({ id: 'users.edit.security.tab' })}</TabsTrigger>
                <TabsTrigger value="devices">{intl.formatMessage({ id: 'users.edit.devices.tab' })}</TabsTrigger>
                <TabsTrigger value="sso">{intl.formatMessage({ id: 'users.edit.sso.tab' })}</TabsTrigger>
              </TabsList>
              <TabsContent value="account">
                <AccountTab
                  editError={editError}
                  editingDisabled={editingDisabled}
                  editingForm={editingForm}
                  editingUser={editingUser}
                  emailVerifiedDisabled={emailVerifiedDisabled}
                  onFormChange={onFormChange}
                  phoneBindingEnabled={phoneBindingEnabled}
                  phoneCountryCodes={phoneCountryCodes}
                  phoneDisabled={phoneDisabled}
                  profileEmailVerificationEnabled={profileEmailVerificationEnabled}
                  saving={saving}
                />
              </TabsContent>
              <TabsContent value="permissions">
                <PermissionsTab
                  availableRoles={availableRoles}
                  disabled={editingDisabled}
                  editingRoleKeys={editingRoleKeys}
                  onRoleToggle={onRoleToggle}
                />
              </TabsContent>
              <TabsContent value="profile">
                <EditUserDetailsBoundary
                  error={currentDetailsError}
                  loading={detailsLoading}
                  onRetry={() => void handleReloadDetails()}
                >
                  {currentManagedUser ? (
                    <ProfileTab
                      disabled={imageBusy}
                      editingDisabled={editingDisabled}
                      editingForm={editingForm}
                      imagePreviewTarget={imagePreviewTarget}
                      onFormChange={onFormChange}
                      onOpenImageDialog={handleOpenImageDialog}
                      onPreviewOpenChange={(target, open) => setImagePreviewTarget(open ? target : null)}
                      user={currentManagedUser}
                    />
                  ) : null}
                </EditUserDetailsBoundary>
              </TabsContent>
              <TabsContent value="security">
                <EditUserDetailsBoundary
                  error={currentDetailsError}
                  loading={detailsLoading}
                  onRetry={() => void handleReloadDetails()}
                >
                  {currentManagedDetails ? (
                    <SecurityTab
                      disabled={securityPending}
                      onDeletePasskey={handleDeletePasskey}
                      onDisableTotp={handleDisableTotp}
                      onSsoRequirementChange={handleSsoRequirementChange}
                      onTwoStepEnabledChange={handleTwoStepEnabledChange}
                      pendingConfirmation={pendingSecurityConfirmation}
                      security={currentManagedDetails.security}
                      setPendingConfirmation={setPendingSecurityConfirmation}
                    />
                  ) : null}
                </EditUserDetailsBoundary>
              </TabsContent>
              <TabsContent value="devices">
                <EditUserDetailsBoundary
                  error={currentDetailsError}
                  loading={detailsLoading}
                  onRetry={() => void handleReloadDetails()}
                >
                  {currentManagedDetails ? (
                    <DevicesTab
                      devices={currentManagedDetails.devices}
                      disabled={devicePending}
                      onRevokeDevice={handleRevokeDevice}
                      onRevokeDevices={handleRevokeDevices}
                    />
                  ) : null}
                </EditUserDetailsBoundary>
              </TabsContent>
              <TabsContent value="sso">
                <EditUserDetailsBoundary
                  error={currentDetailsError}
                  loading={detailsLoading}
                  onRetry={() => void handleReloadDetails()}
                >
                  {currentManagedDetails ? (
                    <SsoTab
                      disabled={securityPending}
                      identities={currentManagedDetails.ssoIdentities}
                      onDeleteIdentity={handleDeleteSsoIdentity}
                    />
                  ) : null}
                </EditUserDetailsBoundary>
              </TabsContent>
            </Tabs>
          </AppDialogBody>
          {showSaveFooter ? (
            <AppDialogFooter>
              <AppDialogClose asChild>
                <Button disabled={saving} type="button" variant="outline">
                  {intl.formatMessage({ id: 'common.cancel' })}
                </Button>
              </AppDialogClose>
              {sensitiveChanges ? (
                <ConfirmActionDialog
                  confirmLabel={intl.formatMessage({ id: 'common.save.changes' })}
                  confirmVariant="default"
                  description={intl.formatMessage({ id: 'users.edit.sensitive.save.description' })}
                  onConfirm={onSave}
                  title={intl.formatMessage({ id: 'users.edit.sensitive.save.title' })}
                >
                  {saveButton}
                </ConfirmActionDialog>
              ) : (
                saveButton
              )}
            </AppDialogFooter>
          ) : null}
        </AppDialogContent>
      </AppDialogRoot>
      {imageConfig && imageTarget ? (
        <ImageCropDialog
          aspect={imageConfig.aspect}
          cropShape={imageConfig.cropShape}
          description={getImageUploadDescription(imageTarget, intl)}
          error={imageUploadError}
          imageSelectLabel={intl.formatMessage({ id: 'profile.image.select' })}
          imageUrl={imageCropUrl}
          loading={imageUploading}
          maxFileBytes={profileImageMaxBytes}
          onImageSelect={handleImageSelect}
          onOpenChange={handleImageDialogOpenChange}
          onRemove={imageUrl ? handleImageRemove : undefined}
          onSubmit={handleImageSubmit}
          open={Boolean(imageTarget)}
          output={imageConfig.output}
          removeLabel={intl.formatMessage({ id: 'common.remove' })}
          removeLoading={imageRemoving}
          showAdjustments={imageConfig.showAdjustments}
          showGrid={imageTarget !== 'avatar'}
          submitLabel={intl.formatMessage({ id: 'common.upload' })}
          title={getImageUploadTitle(imageTarget, intl)}
        />
      ) : null}
    </>
  );
}
