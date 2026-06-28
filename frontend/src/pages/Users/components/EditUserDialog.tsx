import { type Dispatch, type ReactNode, type SetStateAction, useEffect, useState } from 'react';

import {
  ChevronDownIcon,
  FingerprintIcon,
  ImageIcon,
  ImageUpIcon,
  LaptopIcon,
  LinkIcon,
  MonitorIcon,
  SaveIcon,
  ShieldCheckIcon,
  ShieldIcon,
  ShieldOffIcon,
  SmartphoneIcon,
  TabletIcon,
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
import { composePhoneNumber, formatPhoneCountryCode, getPhonePlaceholder } from '@/lib/phone';
import {
  formatPasskeyCount,
  formatPasskeyDeviceType,
  formatPasskeyDisplayName,
  formatSecurityDate,
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

import BirthdayPicker from '@/components/BirthdayPicker';
import { ConfirmActionDialog } from '@/components/ConfirmActionDialog';
import FormMessage from '@/components/FormMessage';
import ImageCropDialog from '@/components/ImageCropDialog';
import { ImagePreviewMedia, ImagePreviewTrigger } from '@/components/ImagePreviewDialog';
import { ProfileItem, ProfileSection } from '@/components/ProfileCardList';
import { ProfileGenderInput, ProfileLocationInput } from '@/components/ProfileInputs';

import { arraysEqual, type EditUserForm, getVerifiedStateTooltip, isEditUserFormChanged } from '../utils';
import { RoleEditor } from './RoleEditor';
import { ToggleControl } from './ToggleControl';

type UserDialogTab = 'account' | 'permissions' | 'profile' | 'security' | 'devices' | 'sso';
type UserImageTarget = 'avatar' | 'profileBanner' | 'profileBackground';
type PendingSecurityConfirmation = 'disable-sso-requirement' | 'disable-two-step' | null;

interface UserImageConfig {
  title: string;
  description: string;
  imageSelectLabel: string;
  removeLabel: string;
  submitLabel: string;
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

const profileImageMimeTypes = new Set(['image/gif', 'image/jpeg', 'image/png', 'image/webp']);
const profileImageTypeError = 'Use a JPEG, PNG, WebP, or GIF image.';

const userImageConfigs: Record<UserImageTarget, UserImageConfig> = {
  avatar: {
    title: 'Upload avatar',
    description: 'Crop the avatar before uploading.',
    imageSelectLabel: 'Select avatar',
    removeLabel: 'Remove',
    submitLabel: 'Upload',
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
    title: 'Upload profile banner',
    description: 'Crop and adjust the profile banner image.',
    imageSelectLabel: 'Select profile banner',
    removeLabel: 'Remove',
    submitLabel: 'Upload',
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
    title: 'Upload profile background',
    description: 'Crop and adjust the profile background image.',
    imageSelectLabel: 'Select profile background',
    removeLabel: 'Remove',
    submitLabel: 'Upload',
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
  const [securityPending, setSecurityPending] = useState(false);
  const [imageTarget, setImageTarget] = useState<UserImageTarget | null>(null);
  const [imageCropUrl, setImageCropUrl] = useState<string | null>(null);
  const [imagePreviewTarget, setImagePreviewTarget] = useState<UserImageTarget | null>(null);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageRemoving, setImageRemoving] = useState(false);
  const [pendingSecurityConfirmation, setPendingSecurityConfirmation] = useState<PendingSecurityConfirmation>(null);
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
      Save changes
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
            message: getApiErrorMessage(error, 'User details could not be loaded.'),
            userId: editingUserId,
          });
        }
      });

    return () => {
      isActive = false;
    };
  }, [editingUserId, onManagedUserChange]);

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
        message: getApiErrorMessage(error, 'User details could not be loaded.'),
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
      toast.error(getApiErrorMessage(error, 'Security settings could not be updated.'));
    } finally {
      setSecurityPending(false);
    }
  };

  const handleTwoStepEnabledChange = (enabled: boolean) =>
    handleSecurityUpdate(
      (userId) => updateUserMfaSettings(userId, { enabled }),
      enabled ? 'Two-step verification enabled.' : 'Two-step verification disabled.',
    );

  const handleSsoRequirementChange = (requiredForSso: boolean) =>
    handleSecurityUpdate(
      (userId) => updateUserMfaSettings(userId, { requiredForSso }),
      requiredForSso ? 'Third-party sign-in verification enabled.' : 'Third-party sign-in verification disabled.',
    );

  const handleDisableTotp = () =>
    handleSecurityUpdate((userId) => disableUserTotp(userId), 'Authenticator app removed.');

  const handleDeletePasskey = (passkeyId: string) =>
    handleSecurityUpdate((userId) => deleteUserPasskey(userId, passkeyId), 'Passkey removed.');

  const handleDeleteSsoIdentity = async (providerId: string) => {
    if (!editingUser) {
      return;
    }

    setSecurityPending(true);

    try {
      const result = await deleteUserSsoIdentity(editingUser.id, providerId);

      setManagedDetails((current) => (current ? { ...current, ssoIdentities: result.identities } : current));
      toast.success('SSO binding removed.');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'SSO binding could not be removed.'));
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
    const objectUrl = createUserImageObjectUrl(file, setImageUploadError);

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
      toast.success(`${getImageLabel(imageTarget)} updated.`);
    } catch (error) {
      const message = getApiErrorMessage(error, `${getImageLabel(imageTarget)} could not be uploaded.`);

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
      toast.success(`${getImageLabel(imageTarget)} removed.`);
    } catch (error) {
      const message = getApiErrorMessage(error, `${getImageLabel(imageTarget)} could not be removed.`);

      setImageUploadError(message);
      toast.error(message);
    } finally {
      setImageRemoving(false);
    }
  };

  return (
    <>
      <Dialog open={Boolean(editingUser)} onOpenChange={handleDialogOpenChange}>
        <DialogContent
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl"
          onInteractOutside={handleDialogInteractOutside}
        >
          <DialogHeader>
            <DialogTitle>Edit user</DialogTitle>
            <DialogDescription>
              Update account, profile, security, devices, and sign-in bindings for{' '}
              {currentManagedUser?.displayName ?? 'the selected user'}.
            </DialogDescription>
          </DialogHeader>
          <Tabs value={activeTab} onValueChange={(value: string) => setActiveTab(value as UserDialogTab)}>
            <TabsList className="h-auto w-full flex-wrap justify-start" variant="line">
              <TabsTrigger value="account">Account</TabsTrigger>
              <TabsTrigger value="permissions">Permissions</TabsTrigger>
              <TabsTrigger value="profile">Profile</TabsTrigger>
              <TabsTrigger value="security">Security</TabsTrigger>
              <TabsTrigger value="devices">Login Devices</TabsTrigger>
              <TabsTrigger value="sso">SSO</TabsTrigger>
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
                {currentManagedDetails ? <DevicesTab devices={currentManagedDetails.devices} /> : null}
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
          {showSaveFooter ? (
            <DialogFooter>
              <DialogClose asChild>
                <Button disabled={saving} type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              {sensitiveChanges ? (
                <ConfirmActionDialog
                  confirmLabel="Save changes"
                  confirmVariant="default"
                  description="This update changes roles, availability, password, or trusted contact verification state for the selected user."
                  onConfirm={onSave}
                  title="Save sensitive user changes?"
                >
                  {saveButton}
                </ConfirmActionDialog>
              ) : (
                saveButton
              )}
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>
      {imageConfig ? (
        <ImageCropDialog
          aspect={imageConfig.aspect}
          cropShape={imageConfig.cropShape}
          description={imageConfig.description}
          error={imageUploadError}
          imageSelectLabel={imageConfig.imageSelectLabel}
          imageUrl={imageCropUrl}
          loading={imageUploading}
          maxFileBytes={profileImageMaxBytes}
          onImageSelect={handleImageSelect}
          onOpenChange={handleImageDialogOpenChange}
          onRemove={imageUrl ? handleImageRemove : undefined}
          onSubmit={handleImageSubmit}
          open={Boolean(imageTarget)}
          output={imageConfig.output}
          removeLabel={imageConfig.removeLabel}
          removeLoading={imageRemoving}
          showAdjustments={imageConfig.showAdjustments}
          showGrid={imageTarget !== 'avatar'}
          submitLabel={imageConfig.submitLabel}
          title={imageConfig.title}
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
  return (
    <div className="grid gap-5 pt-2">
      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="editUsername">Username</Label>
          <Input
            autoComplete="username"
            disabled={saving}
            id="editUsername"
            onChange={(event) => onFormChange((current) => ({ ...current, username: event.target.value }))}
            value={editingForm.username}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="editDisplayName">Display name</Label>
          <Input
            autoComplete="name"
            disabled={saving}
            id="editDisplayName"
            onChange={(event) => onFormChange((current) => ({ ...current, displayName: event.target.value }))}
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

                onFormChange((current) => ({
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
              onCheckedChange={(checked) => onFormChange((current) => ({ ...current, emailVerified: checked }))}
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
                placeholder={phoneBindingEnabled ? getPhonePlaceholder(editingForm.phoneCountryCode) : 'Not configured'}
                value={editingForm.phoneLocalNumber}
              />
            </div>
            <ToggleControl
              checked={editingForm.phoneVerified}
              disabled={phoneDisabled || !editingForm.phoneLocalNumber.trim()}
              label="Phone verified"
              onCheckedChange={(checked) => onFormChange((current) => ({ ...current, phoneVerified: checked }))}
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
            onChange={(event) => onFormChange((current) => ({ ...current, password: event.target.value }))}
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
            onCheckedChange={(checked) => onFormChange((current) => ({ ...current, available: checked }))}
            tooltip={editingForm.available ? 'Available' : 'Disabled'}
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
  const selectedPermissionKeys = resolveSelectedPermissionKeys(availableRoles, editingRoleKeys);

  return (
    <div className="grid gap-4 pt-2">
      <ProfileSection title="Roles" description="Assign role groups for this user.">
        <div className="p-4">
          <RoleEditor
            disabled={disabled}
            onToggle={onRoleToggle}
            roles={availableRoles}
            selectedRoleKeys={editingRoleKeys}
          />
        </div>
      </ProfileSection>
      <ProfileSection title="Permissions" description="Permissions granted by the selected roles.">
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
            <span className="text-sm text-muted-foreground">No permissions assigned.</span>
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
  const avatarUrl = resolveAssetUrl(user.avatarUrl);
  const profileBannerUrl = resolveAssetUrl(user.profileBannerUrl);
  const profileBackgroundUrl = resolveAssetUrl(user.profileBackgroundUrl);

  return (
    <div className="grid gap-4 pt-2">
      <ProfileSection title="Profile details" description="Public profile information shown with this account.">
        <div className="grid gap-4 p-4">
          <div className="grid gap-2">
            <Label htmlFor="editGender">Gender</Label>
            <ProfileGenderInput
              disabled={editingDisabled}
              id="editGender"
              onValueChange={(value) => onFormChange((current) => ({ ...current, gender: value }))}
              value={editingForm.gender}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="editBirthday">Birthday</Label>
            <BirthdayPicker
              disabled={editingDisabled}
              id="editBirthday"
              name="birthday"
              onChange={(value) => onFormChange((current) => ({ ...current, birthday: value }))}
              value={editingForm.birthday}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="editBio">Bio</Label>
            <Textarea
              disabled={editingDisabled}
              id="editBio"
              maxLength={280}
              onChange={(event) => onFormChange((current) => ({ ...current, bio: event.target.value }))}
              placeholder="Introduce this user"
              rows={4}
              value={editingForm.bio}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="editLocation">Location</Label>
            <ProfileLocationInput
              disabled={editingDisabled}
              id="editLocation"
              onValueChange={(value) => onFormChange((current) => ({ ...current, location: value }))}
              value={editingForm.location}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="editWebsiteUrl">Homepage</Label>
            <Input
              autoComplete="url"
              disabled={editingDisabled}
              id="editWebsiteUrl"
              onChange={(event) => onFormChange((current) => ({ ...current, websiteUrl: event.target.value }))}
              placeholder="https://example.com"
              type="url"
              value={editingForm.websiteUrl}
            />
          </div>
        </div>
      </ProfileSection>
      <ProfileSection title="Profile visuals" description="View and update the user's public profile imagery.">
        <ProfileItem
          actionDisabled={disabled}
          actionIcon={<ImageUpIcon />}
          actionLabel="Change"
          description="Shown on the profile and account menus."
          media={
            <ImagePreviewTrigger
              imageAlt={`${user.displayName} avatar`}
              imageUrl={avatarUrl}
              onOpenChange={(open) => onPreviewOpenChange('avatar', open)}
              open={imagePreviewTarget === 'avatar'}
              title="Avatar preview"
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
          status={avatarUrl ? 'Custom' : 'Default'}
          statusVariant={avatarUrl ? 'secondary' : 'outline'}
          title="Avatar"
        />
        <ItemSeparator className="!my-0" />
        <ProfileItem
          actionDisabled={disabled}
          actionIcon={<ImageUpIcon />}
          actionLabel="Change"
          description="Displayed across the top of the user's profile."
          media={
            <ImagePreviewTrigger
              imageAlt={`${user.displayName} profile banner`}
              imageUrl={profileBannerUrl}
              onOpenChange={(open) => onPreviewOpenChange('profileBanner', open)}
              open={imagePreviewTarget === 'profileBanner'}
              title="Profile banner preview"
            >
              <ImagePreviewMedia fallbackIcon={<ImageIcon className="size-4" />} imageUrl={profileBannerUrl} />
            </ImagePreviewTrigger>
          }
          mediaClassName="size-10 rounded-full"
          mediaVariant="default"
          onAction={() => onOpenImageDialog('profileBanner')}
          status={profileBannerUrl ? 'Custom' : 'Default'}
          statusVariant={profileBannerUrl ? 'secondary' : 'outline'}
          title="Profile banner"
        />
        <ItemSeparator className="!my-0" />
        <ProfileItem
          actionDisabled={disabled}
          actionIcon={<ImageUpIcon />}
          actionLabel="Change"
          description="Used as the app background while the user is signed in."
          media={
            <ImagePreviewTrigger
              imageAlt={`${user.displayName} profile background`}
              imageUrl={profileBackgroundUrl}
              onOpenChange={(open) => onPreviewOpenChange('profileBackground', open)}
              open={imagePreviewTarget === 'profileBackground'}
              title="Profile background preview"
            >
              <ImagePreviewMedia fallbackIcon={<WallpaperIcon className="size-4" />} imageUrl={profileBackgroundUrl} />
            </ImagePreviewTrigger>
          }
          mediaClassName="size-10 rounded-full"
          mediaVariant="default"
          onAction={() => onOpenImageDialog('profileBackground')}
          status={profileBackgroundUrl ? 'Custom' : 'Default'}
          statusVariant={profileBackgroundUrl ? 'secondary' : 'outline'}
          title="Profile background"
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
  const twoStepSwitchDisabled =
    disabled ||
    (security.mfaSettings.twoStepEnabled
      ? !security.mfaSettings.twoStepCanDisable
      : !security.mfaSettings.twoStepCanEnable);

  return (
    <div className="grid gap-4 pt-2">
      <ProfileSection
        title="Two-step authentication"
        description="Review strong verifiers and authentication requirements."
      >
        <Item>
          <ItemMedia>
            <ShieldCheckIcon className="size-4" />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>
              Authenticator app
              <Badge variant={security.totpStatus.enabled ? 'secondary' : 'outline'}>
                {security.totpStatus.enabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </ItemTitle>
            <ItemDescription>
              {security.totpStatus.enabled
                ? `${security.totpStatus.recoveryCodesRemaining} recovery codes remain.`
                : 'No authenticator app is configured.'}
            </ItemDescription>
          </ItemContent>
          {security.totpStatus.enabled ? (
            <ItemActions>
              <ConfirmActionDialog
                confirmLabel="Remove"
                description="Authenticator app codes and recovery codes will no longer protect this account."
                onConfirm={onDisableTotp}
                title="Remove authenticator app?"
              >
                <Button disabled={disabled} size="sm" type="button" variant="destructive">
                  <ShieldOffIcon />
                  Remove
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
          description={getTwoStepStatusDescription(security.mfaSettings)}
          disabled={twoStepSwitchDisabled}
          icon={<ShieldIcon className="size-4" />}
          onCheckedChange={(checked) => {
            if (!checked) {
              setPendingConfirmation('disable-two-step');
              return;
            }

            onTwoStepEnabledChange(true);
          }}
          status={security.mfaSettings.twoStepEnabled ? 'Enabled' : 'Off'}
          title="Two-step verification"
        />
        <ItemSeparator className="!my-0" />
        <MfaSwitchItem
          checked={security.mfaSettings.mfaRequiredForSso}
          description="Require two-step authentication after SSO provider verification."
          disabled={disabled || !security.mfaSettings.twoStepEnabled}
          icon={<LinkIcon className="size-4" />}
          onCheckedChange={(checked) => {
            if (!checked) {
              setPendingConfirmation('disable-sso-requirement');
              return;
            }

            onSsoRequirementChange(true);
          }}
          status={security.mfaSettings.mfaRequiredForSso ? 'Enabled' : 'Off'}
          title="Third-party sign-in verification"
        />
      </ProfileSection>
      <ConfirmActionDialog
        confirmLabel="Disable"
        description="Sensitive sign-ins will no longer require a second factor when password sign-in has already succeeded."
        onConfirm={() => {
          setPendingConfirmation(null);
          onTwoStepEnabledChange(false);
        }}
        onOpenChange={(open) => (!open ? setPendingConfirmation(null) : undefined)}
        open={pendingConfirmation === 'disable-two-step'}
        title="Disable two-step verification?"
      />
      <ConfirmActionDialog
        confirmLabel="Disable"
        description="Third-party sign-ins will be accepted after provider verification without an additional local second factor."
        onConfirm={() => {
          setPendingConfirmation(null);
          onSsoRequirementChange(false);
        }}
        onOpenChange={(open) => (!open ? setPendingConfirmation(null) : undefined)}
        open={pendingConfirmation === 'disable-sso-requirement'}
        title="Disable SSO two-step requirement?"
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
  return (
    <Item>
      <ItemMedia>
        <FingerprintIcon className="size-4" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>
          Passkeys
          <Badge variant={passkeys.length > 0 ? 'secondary' : 'outline'}>{formatPasskeyCount(passkeys.length)}</Badge>
        </ItemTitle>
        <ItemDescription>Device-bound or synced passkeys configured for verification.</ItemDescription>
      </ItemContent>
      {passkeys.length > 0 ? (
        <ItemFooter className="mt-1 pl-7">
          <div className="grid w-full gap-0.5 border-t pt-2">
            {passkeys.map((passkey) => (
              <div className="flex items-center justify-between gap-3 py-1.5" key={passkey.id}>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{formatPasskeyDisplayName(passkey.name)}</div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span>{formatPasskeyDeviceType(passkey.deviceType)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{passkey.backedUp ? 'Backed up' : 'Single device'}</span>
                  </div>
                </div>
                <ConfirmActionDialog
                  confirmLabel="Remove"
                  description="This passkey will no longer be available for account verification or sign-in."
                  onConfirm={() => onDeletePasskey(passkey.id)}
                  title="Remove passkey?"
                >
                  <Button
                    aria-label="Remove passkey"
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

function DevicesTab({ devices }: { devices: AuthDeviceSession[] }) {
  return (
    <div className="grid gap-4 pt-2">
      <ProfileSection title="Login devices" description="Active browser sessions for this user.">
        {devices.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">No active devices.</div>
        ) : (
          devices.map((device, index) => (
            <div key={device.id}>
              <DeviceItem device={device} />
              {index < devices.length - 1 ? <ItemSeparator className="!my-0" /> : null}
            </div>
          ))
        )}
      </ProfileSection>
    </div>
  );
}

function DeviceItem({ device }: { device: AuthDeviceSession }) {
  return (
    <Item>
      <ItemMedia>
        <DeviceIcon deviceType={device.deviceType} />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>
          {device.deviceName}
          {device.isCurrent ? <Badge variant="secondary">Current</Badge> : null}
        </ItemTitle>
        <ItemDescription>
          {device.browser} · {device.os}
        </ItemDescription>
        <ItemDescription>
          {formatSecurityDate(device.lastActiveAt)} · {device.ipAddress}
        </ItemDescription>
      </ItemContent>
    </Item>
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
  return (
    <div className="grid gap-4 pt-2">
      <ProfileSection title="SSO bindings" description="External identity providers linked to this account.">
        {identities.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">No SSO providers are bound.</div>
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
                    confirmLabel="Remove"
                    description="This SSO provider will no longer be available for this user."
                    onConfirm={() => onDeleteIdentity(identity.providerId)}
                    title="Remove SSO binding?"
                  >
                    <Button
                      aria-label="Remove SSO binding"
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
  if (loading) {
    return (
      <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        Loading user details
      </div>
    );
  }

  if (error) {
    return (
      <div className="grid min-h-48 place-items-center rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        <div className="grid justify-items-center gap-3">
          <span>{error}</span>
          <Button onClick={onRetry} size="sm" type="button" variant="outline">
            Retry
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

function DeviceIcon({ deviceType }: { deviceType: AuthDeviceSession['deviceType'] }) {
  if (deviceType === 'mobile') {
    return <SmartphoneIcon className="size-4" />;
  }

  if (deviceType === 'tablet') {
    return <TabletIcon className="size-4" />;
  }

  return (
    <>
      <MonitorIcon className="hidden size-4 sm:block" />
      <LaptopIcon className="size-4 sm:hidden" />
    </>
  );
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

function createUserImageObjectUrl(file: File, setError: (message: string | null) => void) {
  if (file.type && !profileImageMimeTypes.has(file.type)) {
    setError(profileImageTypeError);
    return null;
  }

  setError(null);
  return URL.createObjectURL(file);
}

function getImageLabel(target: UserImageTarget | null) {
  if (target === 'avatar') {
    return 'Avatar';
  }

  if (target === 'profileBanner') {
    return 'Profile banner';
  }

  return 'Profile background';
}
