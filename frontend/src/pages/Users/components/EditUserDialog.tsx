import { type Dispatch, type ReactNode, type SetStateAction, useEffect, useState } from 'react';
import { type IntlShape, useIntl } from 'react-intl';

import {
  ChevronDownIcon,
  FingerprintIcon,
  ImageIcon,
  ImageUpIcon,
  LinkIcon,
  LogOutIcon,
  SaveIcon,
  ShieldCheckIcon,
  ShieldIcon,
  ShieldOffIcon,
  Trash2Icon,
  WallpaperIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { getApiErrorMessage } from '@/lib/api';
import {
  type AuthDeviceSession,
  type PasskeySummary,
  type PhoneCountryCode,
  resolveAssetUrl,
  type SsoIdentityPublic,
} from '@/lib/auth';
import { createImageObjectUrl } from '@/lib/image-upload';
import { composePhoneNumber, getPhoneCountryCodeMessageId, getPhonePlaceholder } from '@/lib/phone';
import {
  formatPasskeyCount,
  formatPasskeyDeviceType,
  formatPasskeyDisplayName,
  getTwoStepStatusDescription,
} from '@/lib/security-display';
import {
  deleteUserAvatar,
  deleteUserPasskey,
  deleteUserProfileBackground,
  deleteUserProfileBanner,
  deleteUserSsoIdentity,
  disableUserTotp,
  fetchUserDetails,
  type ManagedUserDetails,
  type ManagedUserSecurity,
  revokeUserDeviceSession,
  revokeUserDeviceSessions,
  type RoleSummary,
  updateUserMfaSettings,
  uploadUserAvatar,
  uploadUserProfileBackground,
  uploadUserProfileBanner,
  type UserListItem,
} from '@/lib/users';
import { Avatar, AvatarFallback, AvatarImage } from '@/shadcn/components/ui/avatar';
import { Badge } from '@/shadcn/components/ui/badge';
import { Button } from '@/shadcn/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shadcn/components/ui/dropdown-menu';
import { Input } from '@/shadcn/components/ui/input';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from '@/shadcn/components/ui/item';
import { Label } from '@/shadcn/components/ui/label';
import { Spinner } from '@/shadcn/components/ui/spinner';
import { Switch } from '@/shadcn/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shadcn/components/ui/tabs';
import { Textarea } from '@/shadcn/components/ui/textarea';

import {
  AppDialogBody,
  AppDialogClose,
  AppDialogContent,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogRoot,
} from '@/components/AppDialog';
import { AuthDeviceItem } from '@/components/AuthDeviceItem';
import BirthdayPicker from '@/components/BirthdayPicker';
import { ConfirmActionDialog } from '@/components/ConfirmActionDialog';
import FormMessage from '@/components/FormMessage';
import ImageCropDialog from '@/components/ImageCropDialog';
import { ImagePreviewMedia, ImagePreviewTrigger } from '@/components/ImagePreviewDialog';
import { ProfileItem, ProfileSection } from '@/components/ProfileCardList';
import { ProfileGenderInput, ProfileLocationInput } from '@/components/ProfileInputs';

import { arraysEqual, type EditUserForm, isEditUserFormChanged } from '../utils';
import { RoleEditor } from './RoleEditor';
import { ToggleControl } from './ToggleControl';

type UserDialogTab = 'account' | 'permissions' | 'profile' | 'security' | 'devices' | 'sso';
type UserImageTarget = 'avatar' | 'profileBanner' | 'profileBackground';
type PendingSecurityConfirmation = 'disable-sso-requirement' | 'disable-two-step' | null;

interface UserImageConfig {
  aspect: number;
  output: {
    contentType?: string;
    fileName: string;
    height: number;
    width: number;
  };
  cropShape?: 'rect' | 'round';
  showAdjustments?: boolean;
  getUrl: (user: UserListItem) => string | undefined;
  remove: (userId: string) => Promise<ManagedUserDetails>;
  upload: (userId: string, file: File) => Promise<ManagedUserDetails>;
}

const userImageConfigs: Record<UserImageTarget, UserImageConfig> = {
  avatar: {
    aspect: 1,
    cropShape: 'round',
    output: {
      fileName: 'avatar.png',
      height: 512,
      width: 512,
    },
    getUrl: (user) => user.avatarUrl,
    remove: deleteUserAvatar,
    upload: uploadUserAvatar,
  },
  profileBanner: {
    aspect: 4,
    showAdjustments: true,
    output: {
      contentType: 'image/webp',
      fileName: 'profile-banner.webp',
      height: 400,
      width: 1600,
    },
    getUrl: (user) => user.profileBannerUrl,
    remove: deleteUserProfileBanner,
    upload: uploadUserProfileBanner,
  },
  profileBackground: {
    aspect: 16 / 9,
    showAdjustments: true,
    output: {
      contentType: 'image/webp',
      fileName: 'profile-background.webp',
      height: 1080,
      width: 1920,
    },
    getUrl: (user) => user.profileBackgroundUrl,
    remove: deleteUserProfileBackground,
    upload: uploadUserProfileBackground,
  },
};

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
      !arraysEqual(editingRoleKeys, editingUser.roles)
    : false;
  const rolesChanged = editingUser ? !arraysEqual(editingRoleKeys, editingUser.roles) : false;
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
                <DetailsBoundary
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
                </DetailsBoundary>
              </TabsContent>
              <TabsContent value="security">
                <DetailsBoundary
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
                </DetailsBoundary>
              </TabsContent>
              <TabsContent value="devices">
                <DetailsBoundary
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
                </DetailsBoundary>
              </TabsContent>
              <TabsContent value="sso">
                <DetailsBoundary
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
                </DetailsBoundary>
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

function AccountTab({
  editError,
  editingDisabled,
  editingForm,
  editingUser,
  emailVerifiedDisabled,
  onFormChange,
  phoneBindingEnabled,
  phoneCountryCodes,
  phoneDisabled,
  profileEmailVerificationEnabled,
  saving,
}: {
  editError: string | null;
  editingDisabled: boolean;
  editingForm: EditUserForm;
  editingUser: UserListItem | null;
  emailVerifiedDisabled: boolean;
  onFormChange: Dispatch<SetStateAction<EditUserForm>>;
  phoneBindingEnabled: boolean;
  phoneCountryCodes: PhoneCountryCode[];
  phoneDisabled: boolean;
  profileEmailVerificationEnabled: boolean;
  saving: boolean;
}) {
  const intl = useIntl();

  return (
    <div className="grid gap-5 pt-2">
      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="editUsername">{intl.formatMessage({ id: 'auth.username' })}</Label>
          <Input
            autoComplete="username"
            disabled={saving}
            id="editUsername"
            onChange={(event) => onFormChange((current) => ({ ...current, username: event.target.value }))}
            placeholder={intl.formatMessage({ id: 'auth.username.placeholder' })}
            value={editingForm.username}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="editDisplayName">{intl.formatMessage({ id: 'profile.display.name' })}</Label>
          <Input
            autoComplete="name"
            disabled={saving}
            id="editDisplayName"
            onChange={(event) => onFormChange((current) => ({ ...current, displayName: event.target.value }))}
            placeholder={intl.formatMessage({ id: 'profile.display.name.placeholder' })}
            value={editingForm.displayName}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="editEmail">{intl.formatMessage({ id: 'profile.email' })}</Label>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <Input
              autoComplete="email"
              disabled={editingDisabled}
              id="editEmail"
              onChange={(event) => {
                const email = event.target.value;

                onFormChange((current) => ({
                  ...current,
                  email,
                  emailVerified: editingUser && email === editingUser.email ? editingUser.emailVerified : false,
                }));
              }}
              placeholder={intl.formatMessage({ id: 'auth.email.placeholder' })}
              type="email"
              value={editingForm.email}
            />
            <ToggleControl
              checked={editingForm.emailVerified}
              disabled={emailVerifiedDisabled}
              label={intl.formatMessage({ id: 'users.edit.email.verified.label' })}
              onCheckedChange={(checked) => onFormChange((current) => ({ ...current, emailVerified: checked }))}
              showLabel={false}
              tooltip={formatVerifiedStateTooltip(
                intl,
                intl.formatMessage({ id: 'profile.email' }),
                editingForm.emailVerified,
                profileEmailVerificationEnabled
                  ? undefined
                  : intl.formatMessage({ id: 'users.edit.email.verification.not.configured' }),
              )}
            />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="editPhoneLocalNumber">{intl.formatMessage({ id: 'profile.phone' })}</Label>
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
                        onFormChange((current) => {
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
                      {intl.formatMessage({ id: getPhoneCountryCodeMessageId(countryCode) })}
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

                  onFormChange((current) => {
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
                  phoneBindingEnabled
                    ? getPhonePlaceholder(editingForm.phoneCountryCode)
                    : intl.formatMessage({ id: 'common.not.configured' })
                }
                value={editingForm.phoneLocalNumber}
              />
            </div>
            <ToggleControl
              checked={editingForm.phoneVerified}
              disabled={phoneDisabled || !editingForm.phoneLocalNumber.trim()}
              label={intl.formatMessage({ id: 'users.edit.phone.verified.label' })}
              onCheckedChange={(checked) => onFormChange((current) => ({ ...current, phoneVerified: checked }))}
              showLabel={false}
              tooltip={formatVerifiedStateTooltip(
                intl,
                intl.formatMessage({ id: 'profile.phone' }),
                editingForm.phoneVerified,
                !phoneBindingEnabled
                  ? intl.formatMessage({ id: 'users.edit.sms.verification.not.configured' })
                  : editingForm.phoneLocalNumber.trim()
                    ? undefined
                    : intl.formatMessage({ id: 'users.edit.phone.verification.requires.phone' }),
              )}
            />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="editPassword">{intl.formatMessage({ id: 'auth.password' })}</Label>
          <Input
            autoComplete="new-password"
            disabled={editingDisabled}
            id="editPassword"
            onChange={(event) => onFormChange((current) => ({ ...current, password: event.target.value }))}
            placeholder={intl.formatMessage({ id: 'users.edit.password.placeholder' })}
            type="password"
            value={editingForm.password}
          />
        </div>
        <div className="grid gap-2">
          <Label>{intl.formatMessage({ id: 'users.edit.availability' })}</Label>
          <ToggleControl
            checked={editingForm.available}
            disabled={editingDisabled}
            label={intl.formatMessage({ id: editingForm.available ? 'users.available' : 'users.disabled' })}
            onCheckedChange={(checked) => onFormChange((current) => ({ ...current, available: checked }))}
            tooltip={intl.formatMessage({ id: editingForm.available ? 'users.available' : 'users.disabled' })}
          />
        </div>
      </div>
      <FormMessage message={editError} variant="error" />
    </div>
  );
}

function PermissionsTab({
  availableRoles,
  disabled,
  editingRoleKeys,
  onRoleToggle,
}: {
  availableRoles: RoleSummary[];
  disabled: boolean;
  editingRoleKeys: string[];
  onRoleToggle: (roleKey: string, enabled: boolean) => void;
}) {
  const intl = useIntl();
  const selectedPermissionKeys = resolveSelectedPermissionKeys(availableRoles, editingRoleKeys);

  return (
    <div className="grid gap-4 pt-2">
      <ProfileSection
        title={intl.formatMessage({ id: 'users.roles' })}
        description={intl.formatMessage({ id: 'users.edit.roles.description' })}
      >
        <div className="p-4">
          <RoleEditor
            disabled={disabled}
            onToggle={onRoleToggle}
            roles={availableRoles}
            selectedRoleKeys={editingRoleKeys}
          />
        </div>
      </ProfileSection>
      <ProfileSection
        title={intl.formatMessage({ id: 'users.permissions' })}
        description={intl.formatMessage({ id: 'users.edit.permissions.description' })}
      >
        <div className="p-4">
          {selectedPermissionKeys.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {selectedPermissionKeys.map((permissionKey) => (
                <Badge key={permissionKey} variant="outline">
                  {permissionKey}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">{intl.formatMessage({ id: 'users.no.permissions' })}</span>
          )}
        </div>
      </ProfileSection>
    </div>
  );
}

function ProfileTab({
  disabled,
  editingDisabled,
  editingForm,
  imagePreviewTarget,
  onFormChange,
  onOpenImageDialog,
  onPreviewOpenChange,
  user,
}: {
  disabled: boolean;
  editingDisabled: boolean;
  editingForm: EditUserForm;
  imagePreviewTarget: UserImageTarget | null;
  onFormChange: Dispatch<SetStateAction<EditUserForm>>;
  onOpenImageDialog: (target: UserImageTarget) => void;
  onPreviewOpenChange: (target: UserImageTarget, open: boolean) => void;
  user: UserListItem;
}) {
  const intl = useIntl();
  const avatarUrl = resolveAssetUrl(user.avatarUrl);
  const profileBannerUrl = resolveAssetUrl(user.profileBannerUrl);
  const profileBackgroundUrl = resolveAssetUrl(user.profileBackgroundUrl);

  return (
    <div className="grid gap-4 pt-2">
      <ProfileSection
        title={intl.formatMessage({ id: 'profile.details' })}
        description={intl.formatMessage({ id: 'profile.details.description' })}
      >
        <div className="grid gap-4 p-4">
          <div className="grid gap-2">
            <Label htmlFor="editGender">{intl.formatMessage({ id: 'profile.gender' })}</Label>
            <ProfileGenderInput
              disabled={editingDisabled}
              id="editGender"
              onValueChange={(value) => onFormChange((current) => ({ ...current, gender: value }))}
              value={editingForm.gender}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="editBirthday">{intl.formatMessage({ id: 'profile.birthday' })}</Label>
            <BirthdayPicker
              disabled={editingDisabled}
              id="editBirthday"
              name="birthday"
              onChange={(value) => onFormChange((current) => ({ ...current, birthday: value }))}
              value={editingForm.birthday}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="editBio">{intl.formatMessage({ id: 'profile.bio' })}</Label>
            <Textarea
              disabled={editingDisabled}
              id="editBio"
              maxLength={280}
              onChange={(event) => onFormChange((current) => ({ ...current, bio: event.target.value }))}
              placeholder={intl.formatMessage({ id: 'users.edit.introduce.user.placeholder' })}
              rows={4}
              value={editingForm.bio}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="editLocation">{intl.formatMessage({ id: 'profile.location' })}</Label>
            <ProfileLocationInput
              disabled={editingDisabled}
              id="editLocation"
              onValueChange={(value) => onFormChange((current) => ({ ...current, location: value }))}
              value={editingForm.location}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="editWebsiteUrl">{intl.formatMessage({ id: 'profile.homepage' })}</Label>
            <Input
              autoComplete="url"
              disabled={editingDisabled}
              id="editWebsiteUrl"
              onChange={(event) => onFormChange((current) => ({ ...current, websiteUrl: event.target.value }))}
              placeholder={intl.formatMessage({ id: 'profile.website.placeholder' })}
              type="url"
              value={editingForm.websiteUrl}
            />
          </div>
        </div>
      </ProfileSection>
      <ProfileSection
        title={intl.formatMessage({ id: 'users.profile.visuals' })}
        description={intl.formatMessage({ id: 'users.profile.visuals.description' })}
      >
        <ProfileItem
          actionDisabled={disabled}
          actionIcon={<ImageUpIcon />}
          actionLabel={intl.formatMessage({ id: 'common.change' })}
          description={intl.formatMessage({ id: 'users.profile.visuals.avatar.description' })}
          media={
            <ImagePreviewTrigger
              imageAlt={intl.formatMessage({ id: 'profile.avatar.alt' }, { name: user.displayName })}
              imageUrl={avatarUrl}
              onOpenChange={(open) => onPreviewOpenChange('avatar', open)}
              open={imagePreviewTarget === 'avatar'}
              title={intl.formatMessage({ id: 'profile.avatar.preview' })}
            >
              <Avatar className="size-full">
                <AvatarImage src={avatarUrl} alt={user.displayName} />
                <AvatarFallback>{getUserFallback(user.displayName)}</AvatarFallback>
              </Avatar>
            </ImagePreviewTrigger>
          }
          mediaClassName="size-10 rounded-full"
          mediaVariant="default"
          onAction={() => onOpenImageDialog('avatar')}
          status={intl.formatMessage({ id: avatarUrl ? 'common.custom' : 'common.default' })}
          statusVariant={avatarUrl ? 'secondary' : 'outline'}
          title={intl.formatMessage({ id: 'profile.avatar' })}
        />
        <ItemSeparator className="!my-0" />
        <ProfileItem
          actionDisabled={disabled}
          actionIcon={<ImageUpIcon />}
          actionLabel={intl.formatMessage({ id: 'common.change' })}
          description={intl.formatMessage({ id: 'users.profile.visuals.banner.description' })}
          media={
            <ImagePreviewTrigger
              imageAlt={intl.formatMessage({ id: 'profile.banner.alt' }, { name: user.displayName })}
              imageUrl={profileBannerUrl}
              onOpenChange={(open) => onPreviewOpenChange('profileBanner', open)}
              open={imagePreviewTarget === 'profileBanner'}
              title={intl.formatMessage({ id: 'profile.banner.preview' })}
            >
              <ImagePreviewMedia fallbackIcon={<ImageIcon className="size-4" />} imageUrl={profileBannerUrl} />
            </ImagePreviewTrigger>
          }
          mediaClassName="size-10 rounded-full"
          mediaVariant="default"
          onAction={() => onOpenImageDialog('profileBanner')}
          status={intl.formatMessage({ id: profileBannerUrl ? 'common.custom' : 'common.default' })}
          statusVariant={profileBannerUrl ? 'secondary' : 'outline'}
          title={intl.formatMessage({ id: 'profile.banner' })}
        />
        <ItemSeparator className="!my-0" />
        <ProfileItem
          actionDisabled={disabled}
          actionIcon={<ImageUpIcon />}
          actionLabel={intl.formatMessage({ id: 'common.change' })}
          description={intl.formatMessage({ id: 'users.profile.visuals.background.description' })}
          media={
            <ImagePreviewTrigger
              imageAlt={intl.formatMessage({ id: 'profile.background.alt' }, { name: user.displayName })}
              imageUrl={profileBackgroundUrl}
              onOpenChange={(open) => onPreviewOpenChange('profileBackground', open)}
              open={imagePreviewTarget === 'profileBackground'}
              title={intl.formatMessage({ id: 'profile.background.preview' })}
            >
              <ImagePreviewMedia fallbackIcon={<WallpaperIcon className="size-4" />} imageUrl={profileBackgroundUrl} />
            </ImagePreviewTrigger>
          }
          mediaClassName="size-10 rounded-full"
          mediaVariant="default"
          onAction={() => onOpenImageDialog('profileBackground')}
          status={intl.formatMessage({ id: profileBackgroundUrl ? 'common.custom' : 'common.default' })}
          statusVariant={profileBackgroundUrl ? 'secondary' : 'outline'}
          title={intl.formatMessage({ id: 'profile.background' })}
        />
      </ProfileSection>
    </div>
  );
}

function SecurityTab({
  disabled,
  onDeletePasskey,
  onDisableTotp,
  onSsoRequirementChange,
  onTwoStepEnabledChange,
  pendingConfirmation,
  security,
  setPendingConfirmation,
}: {
  disabled: boolean;
  onDeletePasskey: (passkeyId: string) => void;
  onDisableTotp: () => void;
  onSsoRequirementChange: (enabled: boolean) => void;
  onTwoStepEnabledChange: (enabled: boolean) => void;
  pendingConfirmation: PendingSecurityConfirmation;
  security: ManagedUserSecurity;
  setPendingConfirmation: (confirmation: PendingSecurityConfirmation) => void;
}) {
  const intl = useIntl();
  const twoStepSwitchDisabled =
    disabled ||
    (security.mfaSettings.twoStepEnabled
      ? !security.mfaSettings.twoStepCanDisable
      : !security.mfaSettings.twoStepCanEnable);

  return (
    <div className="grid gap-4 pt-2">
      <ProfileSection
        title={intl.formatMessage({ id: 'security.two.step.authentication' })}
        description={intl.formatMessage({ id: 'users.edit.two.step.description' })}
      >
        <Item>
          <ItemMedia>
            <ShieldCheckIcon className="size-4" />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>
              {intl.formatMessage({ id: 'security.authenticator.app' })}
              <Badge variant={security.totpStatus.enabled ? 'secondary' : 'outline'}>
                {intl.formatMessage({ id: security.totpStatus.enabled ? 'common.enabled' : 'common.disabled' })}
              </Badge>
            </ItemTitle>
            <ItemDescription>
              {security.totpStatus.enabled
                ? intl.formatMessage(
                    { id: 'security.recovery.codes.remaining' },
                    { count: security.totpStatus.recoveryCodesRemaining },
                  )
                : intl.formatMessage({ id: 'users.edit.no.authenticator.configured' })}
            </ItemDescription>
          </ItemContent>
          {security.totpStatus.enabled ? (
            <ItemActions>
              <ConfirmActionDialog
                confirmLabel={intl.formatMessage({ id: 'common.remove' })}
                description={intl.formatMessage({ id: 'users.edit.remove.authenticator.description' })}
                onConfirm={onDisableTotp}
                title={intl.formatMessage({ id: 'users.edit.remove.authenticator.title' })}
              >
                <Button disabled={disabled} size="sm" type="button" variant="destructive">
                  <ShieldOffIcon />
                  {intl.formatMessage({ id: 'common.remove' })}
                </Button>
              </ConfirmActionDialog>
            </ItemActions>
          ) : null}
        </Item>
        <ItemSeparator className="!my-0" />
        <PasskeyItem disabled={disabled} onDeletePasskey={onDeletePasskey} passkeys={security.passkeys} />
        <ItemSeparator className="!my-0" />
        <MfaSwitchItem
          checked={security.mfaSettings.twoStepEnabled}
          description={getTwoStepStatusDescription(security.mfaSettings, intl)}
          disabled={twoStepSwitchDisabled}
          icon={<ShieldIcon className="size-4" />}
          onCheckedChange={(checked) => {
            if (!checked) {
              setPendingConfirmation('disable-two-step');
              return;
            }

            onTwoStepEnabledChange(true);
          }}
          status={intl.formatMessage({
            id: security.mfaSettings.twoStepEnabled ? 'common.enabled' : 'common.disabled',
          })}
          title={intl.formatMessage({ id: 'security.two.step.verification' })}
        />
        <ItemSeparator className="!my-0" />
        <MfaSwitchItem
          checked={security.mfaSettings.mfaRequiredForSso}
          description={intl.formatMessage({ id: 'security.sso.mfa.description' })}
          disabled={disabled || !security.mfaSettings.twoStepEnabled}
          icon={<LinkIcon className="size-4" />}
          onCheckedChange={(checked) => {
            if (!checked) {
              setPendingConfirmation('disable-sso-requirement');
              return;
            }

            onSsoRequirementChange(true);
          }}
          status={intl.formatMessage({
            id: security.mfaSettings.mfaRequiredForSso ? 'common.enabled' : 'common.disabled',
          })}
          title={intl.formatMessage({ id: 'security.sso.mfa' })}
        />
      </ProfileSection>
      <ConfirmActionDialog
        confirmLabel={intl.formatMessage({ id: 'common.disable' })}
        description={intl.formatMessage({ id: 'security.disable.totp.description' })}
        onConfirm={() => {
          setPendingConfirmation(null);
          onTwoStepEnabledChange(false);
        }}
        onOpenChange={(open) => (!open ? setPendingConfirmation(null) : undefined)}
        open={pendingConfirmation === 'disable-two-step'}
        title={intl.formatMessage({ id: 'security.disable.totp.title' })}
      />
      <ConfirmActionDialog
        confirmLabel={intl.formatMessage({ id: 'common.disable' })}
        description={intl.formatMessage({ id: 'security.disable.sso.mfa.description' })}
        onConfirm={() => {
          setPendingConfirmation(null);
          onSsoRequirementChange(false);
        }}
        onOpenChange={(open) => (!open ? setPendingConfirmation(null) : undefined)}
        open={pendingConfirmation === 'disable-sso-requirement'}
        title={intl.formatMessage({ id: 'security.disable.sso.mfa.title' })}
      />
    </div>
  );
}

function PasskeyItem({
  disabled,
  onDeletePasskey,
  passkeys,
}: {
  disabled: boolean;
  onDeletePasskey: (passkeyId: string) => void;
  passkeys: PasskeySummary[];
}) {
  const intl = useIntl();

  return (
    <Item>
      <ItemMedia>
        <FingerprintIcon className="size-4" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>
          {intl.formatMessage({ id: 'security.passkeys' })}
          <Badge variant={passkeys.length > 0 ? 'secondary' : 'outline'}>
            {formatPasskeyCount(passkeys.length, intl)}
          </Badge>
        </ItemTitle>
        <ItemDescription>{intl.formatMessage({ id: 'users.edit.passkeys.description' })}</ItemDescription>
      </ItemContent>
      {passkeys.length > 0 ? (
        <ItemFooter className="mt-1 pl-7">
          <div className="grid w-full gap-0.5 border-t pt-2">
            {passkeys.map((passkey) => (
              <div className="flex items-center justify-between gap-3 py-1.5" key={passkey.id}>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{formatPasskeyDisplayName(passkey.name, intl)}</div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span>{formatPasskeyDeviceType(passkey.deviceType, intl)}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {intl.formatMessage({
                        id: passkey.backedUp ? 'security.passkey.backed.up' : 'security.passkey.single.device',
                      })}
                    </span>
                  </div>
                </div>
                <ConfirmActionDialog
                  confirmLabel={intl.formatMessage({ id: 'common.remove' })}
                  description={intl.formatMessage({ id: 'security.passkey.remove.description' })}
                  onConfirm={() => onDeletePasskey(passkey.id)}
                  title={intl.formatMessage({ id: 'security.passkey.remove.title' })}
                >
                  <Button
                    aria-label={intl.formatMessage({ id: 'security.remove.passkey.label' })}
                    disabled={disabled}
                    size="icon"
                    type="button"
                    variant="destructive"
                  >
                    <Trash2Icon />
                  </Button>
                </ConfirmActionDialog>
              </div>
            ))}
          </div>
        </ItemFooter>
      ) : null}
    </Item>
  );
}

function MfaSwitchItem({
  checked,
  description,
  disabled,
  icon,
  onCheckedChange,
  status,
  title,
}: {
  checked: boolean;
  description: string;
  disabled: boolean;
  icon: ReactNode;
  onCheckedChange: (checked: boolean) => void;
  status: string;
  title: string;
}) {
  return (
    <Item>
      <ItemMedia>{icon}</ItemMedia>
      <ItemContent>
        <ItemTitle>
          {title}
          <Badge variant={checked ? 'secondary' : 'outline'}>{status}</Badge>
        </ItemTitle>
        <ItemDescription>{description}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
      </ItemActions>
    </Item>
  );
}

function DevicesTab({
  devices,
  disabled,
  onRevokeDevice,
  onRevokeDevices,
}: {
  devices: AuthDeviceSession[];
  disabled: boolean;
  onRevokeDevice: (sessionId: string) => void;
  onRevokeDevices: () => void;
}) {
  const intl = useIntl();
  const revocableDeviceCount = devices.filter((device) => !device.isCurrent).length;

  return (
    <div className="grid gap-4 pt-2">
      <ProfileSection
        actions={
          revocableDeviceCount > 0 ? (
            <ConfirmActionDialog
              confirmLabel={intl.formatMessage({ id: 'security.sign.out.all.devices' })}
              description={intl.formatMessage({ id: 'users.edit.devices.sign.out.all.description' })}
              onConfirm={onRevokeDevices}
              title={intl.formatMessage({ id: 'users.edit.devices.sign.out.all.title' })}
            >
              <Button disabled={disabled} size="sm" type="button" variant="destructive">
                <LogOutIcon />
                {intl.formatMessage({ id: 'security.sign.out.all.devices' })}
              </Button>
            </ConfirmActionDialog>
          ) : undefined
        }
        title={intl.formatMessage({ id: 'security.login.devices' })}
        description={intl.formatMessage({ id: 'security.login.devices.description' })}
      >
        {devices.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">
            {intl.formatMessage({ id: 'security.login.devices.none' })}
          </div>
        ) : (
          devices.map((device, index) => (
            <div key={device.id}>
              <AuthDeviceItem
                device={device}
                disabled={disabled}
                onRevoke={onRevokeDevice}
                revokeDescription={intl.formatMessage({ id: 'security.device.revoke.description' })}
                revokeLabel={intl.formatMessage({ id: 'security.sign.out.device' })}
                revokeTitle={intl.formatMessage({ id: 'security.device.revoke.title' })}
              />
              {index < devices.length - 1 ? <ItemSeparator className="!my-0" /> : null}
            </div>
          ))
        )}
      </ProfileSection>
    </div>
  );
}

function SsoTab({
  disabled,
  identities,
  onDeleteIdentity,
}: {
  disabled: boolean;
  identities: SsoIdentityPublic[];
  onDeleteIdentity: (providerId: string) => void;
}) {
  const intl = useIntl();

  return (
    <div className="grid gap-4 pt-2">
      <ProfileSection
        title={intl.formatMessage({ id: 'users.edit.sso.bindings' })}
        description={intl.formatMessage({ id: 'users.edit.sso.bindings.description' })}
      >
        {identities.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">
            {intl.formatMessage({ id: 'users.edit.sso.bindings.none' })}
          </div>
        ) : (
          identities.map((identity, index) => (
            <div key={identity.providerId}>
              <Item>
                <ItemMedia>
                  <LinkIcon className="size-4" />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{identity.providerName}</ItemTitle>
                  <ItemDescription>{identity.providerSubject}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <ConfirmActionDialog
                    confirmLabel={intl.formatMessage({ id: 'common.remove' })}
                    description={intl.formatMessage({ id: 'users.edit.remove.sso.binding.description' })}
                    onConfirm={() => onDeleteIdentity(identity.providerId)}
                    title={intl.formatMessage({ id: 'users.edit.remove.sso.binding.title' })}
                  >
                    <Button
                      aria-label={intl.formatMessage({ id: 'users.edit.remove.sso.binding.label' })}
                      disabled={disabled}
                      size="icon"
                      type="button"
                      variant="destructive"
                    >
                      <Trash2Icon />
                    </Button>
                  </ConfirmActionDialog>
                </ItemActions>
              </Item>
              {index < identities.length - 1 ? <ItemSeparator className="!my-0" /> : null}
            </div>
          ))
        )}
      </ProfileSection>
    </div>
  );
}

function DetailsBoundary({
  children,
  error,
  loading,
  onRetry,
}: {
  children: ReactNode;
  error: string | null;
  loading: boolean;
  onRetry: () => void;
}) {
  const intl = useIntl();

  if (loading) {
    return (
      <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        {intl.formatMessage({ id: 'users.edit.details.loading' })}
      </div>
    );
  }

  if (error) {
    return (
      <div className="grid min-h-48 place-items-center rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        <div className="grid justify-items-center gap-3">
          <span>{error}</span>
          <Button onClick={onRetry} size="sm" type="button" variant="outline">
            {intl.formatMessage({ id: 'common.retry' })}
          </Button>
        </div>
      </div>
    );
  }

  return children;
}

function resolveSelectedPermissionKeys(roles: RoleSummary[], selectedRoleKeys: string[]) {
  const selectedRoleSet = new Set(selectedRoleKeys);
  const permissionKeySet = new Set<string>();

  roles.forEach((role) => {
    if (!selectedRoleSet.has(role.key)) {
      return;
    }

    role.permissionKeys.forEach((permissionKey) => permissionKeySet.add(permissionKey));
  });

  return Array.from(permissionKeySet).sort();
}

function getUserFallback(displayName: string) {
  return (
    displayName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || 'U'
  );
}

function formatVerifiedStateTooltip(intl: IntlShape, label: string, verified: boolean, reason?: string) {
  const messageId = reason
    ? 'users.edit.verification.state.tooltip.with.reason'
    : 'users.edit.verification.state.tooltip';

  return intl.formatMessage(
    { id: messageId },
    {
      label,
      reason,
      state: intl.formatMessage({ id: verified ? 'users.edit.verified.state' : 'users.edit.unverified.state' }),
    },
  );
}

function getImageLabel(target: UserImageTarget | null, intl: IntlShape) {
  if (target === 'avatar') {
    return intl.formatMessage({ id: 'profile.avatar' });
  }

  if (target === 'profileBanner') {
    return intl.formatMessage({ id: 'profile.banner' });
  }

  return intl.formatMessage({ id: 'profile.background' });
}

function getImageUploadTitle(target: UserImageTarget, intl: IntlShape) {
  if (target === 'avatar') {
    return intl.formatMessage({ id: 'profile.image.upload.avatar' });
  }

  if (target === 'profileBanner') {
    return intl.formatMessage({ id: 'profile.image.upload.banner' });
  }

  return intl.formatMessage({ id: 'profile.image.upload.background' });
}

function getImageUploadDescription(target: UserImageTarget, intl: IntlShape) {
  if (target === 'avatar') {
    return intl.formatMessage({ id: 'users.profile.visuals.avatar.upload.description' });
  }

  if (target === 'profileBanner') {
    return intl.formatMessage({ id: 'users.profile.visuals.banner.upload.description' });
  }

  return intl.formatMessage({ id: 'users.profile.visuals.background.upload.description' });
}

function getImageUpdatedMessageId(target: UserImageTarget | null) {
  if (target === 'avatar') {
    return 'profile.avatar.updated';
  }

  if (target === 'profileBanner') {
    return 'profile.banner.updated';
  }

  return 'profile.background.updated';
}

function getImageRemovedMessageId(target: UserImageTarget | null) {
  if (target === 'avatar') {
    return 'profile.avatar.removed';
  }

  if (target === 'profileBanner') {
    return 'profile.banner.removed';
  }

  return 'profile.background.removed';
}
