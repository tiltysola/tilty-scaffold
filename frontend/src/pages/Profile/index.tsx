import { type SubmitEventHandler, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import {
  CalendarDaysIcon,
  FileTextIcon,
  ImageIcon,
  ImageUpIcon,
  LinkIcon,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
  UserCogIcon,
  UserPenIcon,
  UserRoundIcon,
  WallpaperIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useAuthenticatedSession } from '@/hooks/useAuth';
import { useImageTextTone } from '@/hooks/useImageTextTone';
import { getApiErrorMessage } from '@/lib/api';
import {
  type AuthUser,
  createVerificationChallenge,
  deleteAvatar,
  deleteProfileBackground,
  deleteProfileBanner,
  fetchAuthConfig,
  fetchSsoConfig,
  fetchSsoIdentities,
  getSsoBindStartUrl,
  getUserHandle,
  getUserInitials,
  type PhoneCountryCode,
  resolveAssetUrl,
  sendProfileEmailVerification,
  sendProfilePhoneVerification,
  sendVerificationCode,
  type SsoIdentityPublic,
  type SsoPublicConfig,
  updateCurrentUser,
  uploadAvatar,
  uploadProfileBackground,
  uploadProfileBanner,
  type VerificationRequired,
  verifyAuthenticationChallenge,
  verifyProfileEmail,
  verifyProfilePhone,
  verifyWithPasskey,
} from '@/lib/auth';
import {
  displayNameSchema,
  phoneNumberSchema,
  profileBioSchema,
  profileBirthdaySchema,
  profileGenderSchema,
  profileLocationSchema,
  profileWebsiteUrlSchema,
  verificationCodeSchema,
} from '@/lib/auth-validation';
import { getPhoneCountryCode, getPhoneLocalNumber, supportedPhoneCountryCodes } from '@/lib/phone';
import {
  getVerificationCodeDelivery,
  maskEmailAddress,
  maskPhoneNumber,
  type VerificationCodeDelivery,
} from '@/lib/verification';
import { Avatar, AvatarFallback, AvatarImage } from '@/shadcn/components/ui/avatar';
import { ItemSeparator } from '@/shadcn/components/ui/item';
import { cn } from '@/shadcn/lib/utils';

import { IdentityVerificationDialog, type IdentityVerificationSubmitInput } from '@/components/IdentityVerification';
import ImageCropDialog from '@/components/ImageCropDialog';
import { ImagePreviewMedia, ImagePreviewTrigger } from '@/components/ImagePreviewDialog';
import { ProfileItem, ProfileSection } from '@/components/ProfileCardList';

import { EditProfileDetailsDialog, type ProfileDetailsDraft } from './components/EditProfileDetailsDialog';
import { EmailVerificationDialog } from './components/EmailVerificationDialog';
import { PhoneVerificationDialog } from './components/PhoneVerificationDialog';
import { ProfileHeader } from './components/ProfileHeader';
import { SsoProviderList } from './components/SsoProviderList';
import { createProfileImageObjectUrl, formatRoleAccessSummary, getHashParams, syncPhoneDraft } from './utils';

interface PendingVerification {
  challenge: VerificationRequired;
  onVerified: () => Promise<void>;
}

type ProfilePreviewTarget = 'avatar' | 'profileBanner' | 'profileBackground';

const defaultProfileImageMaxBytes = 2 * 1024 * 1024;

const Index = () => {
  const { user } = useAuthenticatedSession();

  return <ProfileContent user={user} />;
};

const ProfileContent = ({ user }: { user: AuthUser }) => {
  const initialPhoneCountryCode = getPhoneCountryCode(user.phoneNumber, supportedPhoneCountryCodes);
  const [profileDetailsDraft, setProfileDetailsDraft] = useState(() => createProfileDetailsDraft(user));
  const [phoneCountryCodes, setPhoneCountryCodes] = useState<PhoneCountryCode[]>([]);
  const [phoneCountryCodeDraft, setPhoneCountryCodeDraft] = useState<PhoneCountryCode>(
    initialPhoneCountryCode ?? '+86',
  );
  const [phoneLocalNumberDraft, setPhoneLocalNumberDraft] = useState(
    getPhoneLocalNumber(user.phoneNumber, initialPhoneCountryCode),
  );
  const [phoneVerificationCodeDraft, setPhoneVerificationCodeDraft] = useState('');
  const [phoneVerificationNotice, setPhoneVerificationNotice] = useState<VerificationCodeDelivery | null>(null);
  const [profileEmailVerificationEnabled, setProfileEmailVerificationEnabled] = useState(false);
  const [ssoConfig, setSsoConfig] = useState<SsoPublicConfig>({
    enabled: false,
    loginEnabled: false,
    providers: [],
  });
  const [ssoIdentities, setSsoIdentities] = useState<SsoIdentityPublic[]>([]);
  const [editingProfileDetails, setEditingProfileDetails] = useState(false);
  const [editingPhoneNumber, setEditingPhoneNumber] = useState(false);
  const [verifyingEmail, setVerifyingEmail] = useState(false);
  const [emailVerificationCodeDraft, setEmailVerificationCodeDraft] = useState('');
  const [emailVerificationNotice, setEmailVerificationNotice] = useState<VerificationCodeDelivery | null>(null);
  const [pendingVerification, setPendingVerification] = useState<PendingVerification | null>(null);
  const [profileImageMaxBytes, setProfileImageMaxBytes] = useState(defaultProfileImageMaxBytes);
  const [avatarCropDialogOpen, setAvatarCropDialogOpen] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [deletingAvatar, setDeletingAvatar] = useState(false);
  const [avatarCropImageUrl, setAvatarCropImageUrl] = useState<string | null>(null);
  const [avatarUploadError, setAvatarUploadError] = useState<string | null>(null);
  const [profileBannerCropDialogOpen, setProfileBannerCropDialogOpen] = useState(false);
  const [uploadingProfileBanner, setUploadingProfileBanner] = useState(false);
  const [deletingProfileBanner, setDeletingProfileBanner] = useState(false);
  const [profileBannerCropImageUrl, setProfileBannerCropImageUrl] = useState<string | null>(null);
  const [profileBannerUploadError, setProfileBannerUploadError] = useState<string | null>(null);
  const [profileBackgroundCropDialogOpen, setProfileBackgroundCropDialogOpen] = useState(false);
  const [uploadingProfileBackground, setUploadingProfileBackground] = useState(false);
  const [deletingProfileBackground, setDeletingProfileBackground] = useState(false);
  const [profileBackgroundCropImageUrl, setProfileBackgroundCropImageUrl] = useState<string | null>(null);
  const [profileBackgroundUploadError, setProfileBackgroundUploadError] = useState<string | null>(null);
  const [profilePreviewTarget, setProfilePreviewTarget] = useState<ProfilePreviewTarget | null>(null);
  const profileHeaderRef = useRef<HTMLElement>(null);
  const profileHeaderTextRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const profileAction = useAsyncAction();
  const emailVerificationSendAction = useAsyncAction();
  const emailVerificationConfirmAction = useAsyncAction();
  const phoneVerificationSendAction = useAsyncAction();
  const phoneVerificationConfirmAction = useAsyncAction();
  const securityVerificationAction = useAsyncAction();
  const avatarUrl = resolveAssetUrl(user.avatarUrl);
  const profileBannerUrl = resolveAssetUrl(user.profileBannerUrl);
  const profileBackgroundUrl = resolveAssetUrl(user.profileBackgroundUrl);
  const profileHeaderTextTone = useImageTextTone(profileBannerUrl ?? null, {
    containerRef: profileHeaderRef,
    targetRef: profileHeaderTextRef,
  });
  const fallback = getUserInitials(user.displayName);
  const userHandle = getUserHandle(user.username);
  const savingProfile = profileAction.pending;
  const sendingEmailVerification = emailVerificationSendAction.pending;
  const confirmingEmailVerification = emailVerificationConfirmAction.pending;
  const sendingPhoneVerification = phoneVerificationSendAction.pending;
  const confirmingPhoneVerification = phoneVerificationConfirmAction.pending;
  const phoneVerificationPending = sendingPhoneVerification || confirmingPhoneVerification;
  const savedProfileDetails = useMemo(() => createProfileDetailsDraft(user), [user]);
  const profileDetailsChanged = hasProfileDetailsChanged(profileDetailsDraft, savedProfileDetails);
  const phoneNumberDraft = useMemo(
    () => `${phoneCountryCodeDraft}${phoneLocalNumberDraft.trim()}`,
    [phoneCountryCodeDraft, phoneLocalNumberDraft],
  );
  const emailNeedsVerification = Boolean(user.email && !user.emailVerified);
  const emailVerificationAvailable = emailNeedsVerification && profileEmailVerificationEnabled;
  const phoneBindingEnabled = phoneCountryCodes.length > 0;
  const phoneNumberChanged = phoneBindingEnabled && phoneNumberDraft !== (user.phoneNumber ?? '');
  const phoneVerificationRequired = phoneBindingEnabled && (phoneNumberChanged || !user.phoneVerified);
  const avatarBusy = uploadingAvatar || deletingAvatar;
  const profileBannerBusy = uploadingProfileBanner || deletingProfileBanner;
  const profileBackgroundBusy = uploadingProfileBackground || deletingProfileBackground;
  const profileHeaderTitleClassName = cn(
    'truncate text-lg font-semibold',
    profileBannerUrl && profileHeaderTextTone === 'light'
      ? 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)]'
      : undefined,
    profileBannerUrl && profileHeaderTextTone === 'dark' ? 'text-zinc-950' : undefined,
  );
  const profileHeaderDescriptionClassName = cn(
    'truncate text-sm text-muted-foreground',
    profileBannerUrl && profileHeaderTextTone === 'light'
      ? 'text-white/85 drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)]'
      : undefined,
    profileBannerUrl && profileHeaderTextTone === 'dark' ? 'text-zinc-800' : undefined,
  );
  const profileHeaderActionClassName = cn(
    profileBannerUrl && profileHeaderTextTone === 'light'
      ? 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)] hover:bg-white/15 hover:text-white'
      : undefined,
    profileBannerUrl && profileHeaderTextTone === 'dark'
      ? 'text-zinc-950 hover:bg-black/10 hover:text-zinc-950'
      : undefined,
  );
  const bindableSsoProviders = ssoConfig.enabled
    ? ssoConfig.providers.filter((provider) => provider.bindingEnabled)
    : [];
  const syncProfileState = (updatedUser: AuthUser) => {
    setProfileDetailsDraft(createProfileDetailsDraft(updatedUser));
    syncPhoneDraft(updatedUser.phoneNumber, phoneCountryCodes, setPhoneCountryCodeDraft, setPhoneLocalNumberDraft);
  };

  useEffect(() => {
    const params = getHashParams(location.hash);

    if (params.get('sso_profile_bind') !== 'success') {
      return;
    }

    toast.success('SSO provider bound.');
    navigate(location.pathname, { replace: true });
    void fetchSsoIdentities()
      .then((result) => setSsoIdentities(result.identities))
      .catch((error: unknown) => {
        toast.error(getApiErrorMessage(error, 'SSO identities could not be loaded.'));
      });
  }, [location.hash, location.pathname, navigate]);

  useEffect(() => {
    let isActive = true;

    void fetchAuthConfig()
      .then((config) => {
        if (!isActive) {
          return;
        }

        setPhoneCountryCodes(config.phoneCountryCodes);
        setProfileImageMaxBytes(config.fileUploadMaxBytes);
        setProfileEmailVerificationEnabled(config.profileEmailVerificationEnabled);
        const currentCountryCode = getPhoneCountryCode(
          user.phoneNumber,
          config.phoneCountryCodes.length ? config.phoneCountryCodes : supportedPhoneCountryCodes,
        );
        setPhoneCountryCodeDraft(currentCountryCode ?? config.phoneCountryCodes[0] ?? '+86');
        setPhoneLocalNumberDraft(getPhoneLocalNumber(user.phoneNumber, currentCountryCode));
      })
      .catch((error: unknown) => {
        if (isActive) {
          toast.error(getApiErrorMessage(error, 'Profile configuration could not be loaded.'));
        }
      });

    return () => {
      isActive = false;
    };
  }, [user.phoneNumber]);

  useEffect(() => {
    let isActive = true;

    void Promise.all([fetchSsoConfig(), fetchSsoIdentities()])
      .then(([config, identityResult]) => {
        if (!isActive) {
          return;
        }

        setSsoConfig(config);
        setSsoIdentities(identityResult.identities);
      })
      .catch((error: unknown) => {
        if (isActive) {
          toast.error(getApiErrorMessage(error, 'SSO configuration could not be loaded.'));
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (avatarCropImageUrl) {
        URL.revokeObjectURL(avatarCropImageUrl);
      }
    };
  }, [avatarCropImageUrl]);

  useEffect(() => {
    return () => {
      if (profileBannerCropImageUrl) {
        URL.revokeObjectURL(profileBannerCropImageUrl);
      }
    };
  }, [profileBannerCropImageUrl]);

  useEffect(() => {
    return () => {
      if (profileBackgroundCropImageUrl) {
        URL.revokeObjectURL(profileBackgroundCropImageUrl);
      }
    };
  }, [profileBackgroundCropImageUrl]);

  const handleOpenAvatarCropDialog = () => {
    setAvatarUploadError(null);
    setAvatarCropDialogOpen(true);
  };

  const handleAvatarSelect = (file: File) => {
    const imageUrl = createProfileImageObjectUrl(file, setAvatarUploadError);

    if (!imageUrl) {
      setAvatarCropImageUrl(null);
      return;
    }

    setAvatarCropImageUrl(imageUrl);
  };

  const resetAvatarCropDialog = () => {
    setAvatarCropImageUrl(null);
    setAvatarUploadError(null);
  };

  const handleAvatarCropOpenChange = (open: boolean) => {
    if (open) {
      setAvatarCropDialogOpen(true);
      return;
    }

    if (avatarBusy) {
      return;
    }

    setAvatarCropDialogOpen(false);
    resetAvatarCropDialog();
  };

  const handleAvatarCropSubmit = async (file: File) => {
    setUploadingAvatar(true);
    setAvatarUploadError(null);

    try {
      const updatedUser = await uploadAvatar(file);

      syncProfileState(updatedUser);
      setAvatarCropDialogOpen(false);
      resetAvatarCropDialog();
      toast.success('Avatar updated.');
    } catch (error) {
      const message = getApiErrorMessage(error, 'Avatar could not be uploaded.');

      setAvatarUploadError(message);
      toast.error(message);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleDeleteAvatar = async () => {
    setDeletingAvatar(true);

    try {
      const updatedUser = await deleteAvatar();

      syncProfileState(updatedUser);
      setAvatarCropDialogOpen(false);
      resetAvatarCropDialog();
      toast.success('Avatar removed.');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Avatar could not be removed.'));
    } finally {
      setDeletingAvatar(false);
    }
  };

  const handleOpenProfileBannerCropDialog = () => {
    setProfileBannerUploadError(null);
    setProfileBannerCropDialogOpen(true);
  };

  const handleProfileBannerSelect = (file: File) => {
    const imageUrl = createProfileImageObjectUrl(file, setProfileBannerUploadError);

    if (!imageUrl) {
      setProfileBannerCropImageUrl(null);
      return;
    }

    setProfileBannerCropImageUrl(imageUrl);
  };

  const resetProfileBannerCropDialog = () => {
    setProfileBannerCropImageUrl(null);
    setProfileBannerUploadError(null);
  };

  const handleProfileBannerCropOpenChange = (open: boolean) => {
    if (open) {
      setProfileBannerCropDialogOpen(true);
      return;
    }

    if (profileBannerBusy) {
      return;
    }

    setProfileBannerCropDialogOpen(false);
    resetProfileBannerCropDialog();
  };

  const handleProfileBannerCropSubmit = async (file: File) => {
    setUploadingProfileBanner(true);
    setProfileBannerUploadError(null);

    try {
      const updatedUser = await uploadProfileBanner(file);

      syncProfileState(updatedUser);
      setProfileBannerCropDialogOpen(false);
      resetProfileBannerCropDialog();
      toast.success('Profile banner updated.');
    } catch (error) {
      const message = getApiErrorMessage(error, 'Profile banner could not be uploaded.');

      setProfileBannerUploadError(message);
      toast.error(message);
    } finally {
      setUploadingProfileBanner(false);
    }
  };

  const handleDeleteProfileBanner = async () => {
    setDeletingProfileBanner(true);

    try {
      const updatedUser = await deleteProfileBanner();

      syncProfileState(updatedUser);
      setProfileBannerCropDialogOpen(false);
      resetProfileBannerCropDialog();
      toast.success('Profile banner removed.');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Profile banner could not be removed.'));
    } finally {
      setDeletingProfileBanner(false);
    }
  };

  const handleOpenProfileBackgroundCropDialog = () => {
    setProfileBackgroundUploadError(null);
    setProfileBackgroundCropDialogOpen(true);
  };

  const handleProfileBackgroundSelect = (file: File) => {
    const imageUrl = createProfileImageObjectUrl(file, setProfileBackgroundUploadError);

    if (!imageUrl) {
      setProfileBackgroundCropImageUrl(null);
      return;
    }

    setProfileBackgroundCropImageUrl(imageUrl);
  };

  const resetProfileBackgroundCropDialog = () => {
    setProfileBackgroundCropImageUrl(null);
    setProfileBackgroundUploadError(null);
  };

  const handleProfileBackgroundCropOpenChange = (open: boolean) => {
    if (open) {
      setProfileBackgroundCropDialogOpen(true);
      return;
    }

    if (profileBackgroundBusy) {
      return;
    }

    setProfileBackgroundCropDialogOpen(false);
    resetProfileBackgroundCropDialog();
  };

  const handleProfileBackgroundCropSubmit = async (file: File) => {
    setUploadingProfileBackground(true);
    setProfileBackgroundUploadError(null);

    try {
      const updatedUser = await uploadProfileBackground(file);

      syncProfileState(updatedUser);
      setProfileBackgroundCropDialogOpen(false);
      resetProfileBackgroundCropDialog();
      toast.success('Profile background updated.');
    } catch (error) {
      const message = getApiErrorMessage(error, 'Profile background could not be uploaded.');

      setProfileBackgroundUploadError(message);
      toast.error(message);
    } finally {
      setUploadingProfileBackground(false);
    }
  };

  const handleDeleteProfileBackground = async () => {
    setDeletingProfileBackground(true);

    try {
      const updatedUser = await deleteProfileBackground();

      syncProfileState(updatedUser);
      setProfileBackgroundCropDialogOpen(false);
      resetProfileBackgroundCropDialog();
      toast.success('Profile background removed.');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Profile background could not be removed.'));
    } finally {
      setDeletingProfileBackground(false);
    }
  };

  const handleProfileSubmit: SubmitEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    profileAction.clearError();

    const parsed = parseProfileDetailsDraft(profileDetailsDraft);

    if (!parsed.success) {
      profileAction.setError(parsed.error);
      return;
    }

    const updatedUser = await profileAction.run(() => updateCurrentUser(parsed.data), 'Profile could not be updated.');

    if (updatedUser) {
      syncProfileState(updatedUser);
      setEditingProfileDetails(false);
      toast.success('Profile updated.');
    }
  };

  const requestProfileEmailVerificationCode = async () => {
    setEmailVerificationNotice(null);
    emailVerificationSendAction.clearError();

    const result = await emailVerificationSendAction.run(
      () => sendProfileEmailVerification(),
      'Verification code could not be sent.',
    );

    if (result) {
      setEmailVerificationNotice(getVerificationCodeDelivery('email', maskEmailAddress(user.email)));
    }

    return result;
  };

  const handleStartEmailVerification = async () => {
    if (!emailVerificationAvailable) {
      return;
    }

    setEmailVerificationCodeDraft('');
    setEmailVerificationNotice(null);
    emailVerificationSendAction.clearError();
    emailVerificationConfirmAction.clearError();
    await startContactVerification(async () => {
      setVerifyingEmail(true);
      await requestProfileEmailVerificationCode();
    });
  };

  const handleEmailVerificationOpenChange = (open: boolean) => {
    setVerifyingEmail(open);

    if (!open) {
      setEmailVerificationCodeDraft('');
      setEmailVerificationNotice(null);
      emailVerificationSendAction.clearError();
      emailVerificationConfirmAction.clearError();
    }
  };

  const handleEmailVerificationSubmit: SubmitEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    emailVerificationConfirmAction.clearError();

    const parsed = verificationCodeSchema.safeParse(emailVerificationCodeDraft);

    if (!parsed.success) {
      emailVerificationConfirmAction.setError(parsed.error.issues[0]?.message ?? 'Verification code is invalid.');
      return;
    }

    const updatedUser = await emailVerificationConfirmAction.run(
      () =>
        verifyProfileEmail({
          emailVerificationCode: parsed.data,
        }),
      'Email could not be verified.',
    );

    if (updatedUser) {
      syncProfileState(updatedUser);
      setVerifyingEmail(false);
      setEmailVerificationNotice(null);
      toast.success('Email verified.');
    }
  };

  const parsePhoneNumberDraft = () => {
    if (!phoneBindingEnabled) {
      return {
        error: 'Phone binding is unavailable because no SMS country codes are configured.',
        phoneNumber: undefined,
      };
    }

    const parsed = phoneNumberSchema.safeParse(phoneNumberDraft);

    if (!parsed.success) {
      return {
        error: parsed.error.issues[0]?.message ?? 'Phone number is invalid.',
        phoneNumber: undefined,
      };
    }

    return {
      error: undefined,
      phoneNumber: parsed.data,
    };
  };

  const startContactVerification = async (onVerified: () => Promise<void>) => {
    securityVerificationAction.clearError();

    const challenge = await securityVerificationAction.run(
      () => createVerificationChallenge('update_contact'),
      'Security verification could not be started.',
    );

    if (!challenge) {
      return;
    }

    if ('verified' in challenge) {
      await onVerified();
      return;
    }

    setPendingVerification({
      challenge,
      onVerified,
    });
  };

  const startSsoBindVerification = async (providerId: string) => {
    securityVerificationAction.clearError();

    const challenge = await securityVerificationAction.run(
      () => createVerificationChallenge('manage_sso'),
      'Security verification could not be started.',
    );

    if (!challenge) {
      return;
    }

    const onVerified = async () => {
      window.location.assign(getSsoBindStartUrl(providerId, '/profile'));
    };

    if ('verified' in challenge) {
      await onVerified();
      return;
    }

    setPendingVerification({
      challenge,
      onVerified,
    });
  };

  const requestProfilePhoneVerificationCode = async () => {
    setPhoneVerificationNotice(null);
    phoneVerificationSendAction.clearError();
    phoneVerificationConfirmAction.clearError();

    const parsed = parsePhoneNumberDraft();

    if (!parsed.phoneNumber) {
      phoneVerificationSendAction.setError(parsed.error ?? 'Phone number is invalid.');
      return;
    }

    await sendProfilePhoneVerificationCode(parsed.phoneNumber);
  };

  const sendProfilePhoneVerificationCode = async (phoneNumber: string) => {
    const result = await phoneVerificationSendAction.run(
      () =>
        sendProfilePhoneVerification({
          phoneNumber,
        }),
      'Verification code could not be sent.',
    );

    if (result) {
      setPhoneVerificationNotice(getVerificationCodeDelivery('sms', maskPhoneNumber(phoneNumber)));
    }
  };

  const handlePhoneNumberSubmit: SubmitEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    phoneVerificationConfirmAction.clearError();

    const parsed = parsePhoneNumberDraft();

    if (!parsed.phoneNumber) {
      phoneVerificationConfirmAction.setError(parsed.error ?? 'Phone number is invalid.');
      return;
    }

    const parsedCode = verificationCodeSchema.safeParse(phoneVerificationCodeDraft);

    if (!parsedCode.success) {
      phoneVerificationConfirmAction.setError(parsedCode.error.issues[0]?.message ?? 'Verification code is invalid.');
      return;
    }

    await confirmProfilePhoneVerification(parsed.phoneNumber, parsedCode.data);
  };

  const confirmProfilePhoneVerification = async (phoneNumber: string, phoneVerificationCode: string) => {
    const updatedUser = await phoneVerificationConfirmAction.run(
      () =>
        verifyProfilePhone({
          phoneNumber,
          phoneVerificationCode,
        }),
      'Phone number could not be verified.',
    );

    if (updatedUser) {
      syncProfileState(updatedUser);
      setPhoneVerificationCodeDraft('');
      setPhoneVerificationNotice(null);
      setEditingPhoneNumber(false);
      toast.success('Phone number verified.');
    }
  };

  const handleSendSecurityVerificationCode = async (method: 'email' | 'sms') => {
    if (!pendingVerification) {
      return null;
    }

    const verificationToken = pendingVerification.challenge.verificationToken;

    return securityVerificationAction.run(
      () =>
        sendVerificationCode({
          method,
          verificationToken,
        }),
      'Verification code could not be sent.',
    );
  };

  const handleConfirmSecurityVerification = async (input: IdentityVerificationSubmitInput) => {
    if (!pendingVerification) {
      return;
    }

    const verified =
      input.method === 'passkey'
        ? await securityVerificationAction.run(
            () => verifyWithPasskey(pendingVerification.challenge.verificationToken),
            'Passkey verification could not be completed.',
          )
        : await securityVerificationAction.run(
            () =>
              verifyAuthenticationChallenge({
                verificationToken: pendingVerification.challenge.verificationToken,
                ...input,
              }),
            'Verification could not be completed.',
          );

    if (!verified) {
      return;
    }

    await pendingVerification.onVerified();
    setPendingVerification(null);
  };

  const handleEditProfileDetails = () => {
    setProfileDetailsDraft(createProfileDetailsDraft(user));
    profileAction.clearError();
    setEditingProfileDetails(true);
  };

  const handleEditPhoneNumber = async () => {
    syncPhoneDraft(user.phoneNumber, phoneCountryCodes, setPhoneCountryCodeDraft, setPhoneLocalNumberDraft);
    setPhoneVerificationCodeDraft('');
    setPhoneVerificationNotice(null);
    phoneVerificationSendAction.clearError();
    phoneVerificationConfirmAction.clearError();
    await startContactVerification(async () => setEditingPhoneNumber(true));
  };

  const handlePhoneNumberOpenChange = (open: boolean) => {
    setEditingPhoneNumber(open);

    if (!open) {
      setPhoneVerificationCodeDraft('');
      setPhoneVerificationNotice(null);
      phoneVerificationSendAction.clearError();
      phoneVerificationConfirmAction.clearError();
    }
  };

  const handleBindSsoProvider = (providerId: string) => {
    void startSsoBindVerification(providerId);
  };

  return (
    <div className="grid gap-6 p-4 lg:p-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-normal">Profile</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">Account details, verification, and sign-in methods.</p>
      </div>

      <div className="grid gap-8">
        <ProfileHeader
          actionClassName={profileHeaderActionClassName}
          avatarAlt={user.displayName}
          avatarBusy={avatarBusy}
          avatarUrl={avatarUrl}
          bannerBusy={profileBannerBusy}
          bannerUrl={profileBannerUrl}
          descriptionClassName={profileHeaderDescriptionClassName}
          fallback={fallback}
          onChangeAvatar={handleOpenAvatarCropDialog}
          onChangeBanner={handleOpenProfileBannerCropDialog}
          onEditProfileDetails={handleEditProfileDetails}
          sectionRef={profileHeaderRef}
          textRef={profileHeaderTextRef}
          title={user.displayName}
          titleClassName={profileHeaderTitleClassName}
          uploadingAvatar={uploadingAvatar}
          uploadingBanner={uploadingProfileBanner}
          userHandle={userHandle}
        />

        <div className="grid gap-8">
          <ProfileSection
            actionIcon={<UserPenIcon />}
            actionLabel="Edit"
            description="Display name, bio, and public profile metadata."
            onAction={handleEditProfileDetails}
            title="Profile details"
          >
            <ProfileItem
              description={user.displayName}
              icon={<UserPenIcon className="size-4" />}
              title="Display name"
            />

            <ItemSeparator className="!my-0" />

            <ProfileItem
              description={formatProfileDetail(user.bio)}
              icon={<FileTextIcon className="size-4" />}
              title="Bio"
            />

            <ItemSeparator className="!my-0" />

            <ProfileItem
              description={formatProfileDetail(user.gender)}
              icon={<UserRoundIcon className="size-4" />}
              title="Gender"
            />

            <ItemSeparator className="!my-0" />

            <ProfileItem
              description={formatProfileDetail(user.birthday)}
              icon={<CalendarDaysIcon className="size-4" />}
              title="Birthday"
            />

            <ItemSeparator className="!my-0" />

            <ProfileItem
              description={formatProfileLocation(user.location)}
              icon={<MapPinIcon className="size-4" />}
              title="Location"
            />

            <ItemSeparator className="!my-0" />

            <ProfileItem
              description={formatProfileDetail(user.websiteUrl)}
              icon={<LinkIcon className="size-4" />}
              title="Homepage"
            />
          </ProfileSection>

          <ProfileSection title="Personalization" description="Profile visuals.">
            <ProfileItem
              actionDisabled={avatarBusy}
              actionIcon={<ImageUpIcon />}
              actionLabel="Change"
              description="Shown on your profile and account menus."
              media={
                <ImagePreviewTrigger
                  imageAlt={`${user.displayName} avatar`}
                  imageUrl={avatarUrl}
                  onOpenChange={(open) => setProfilePreviewTarget(open ? 'avatar' : null)}
                  open={profilePreviewTarget === 'avatar'}
                  title="Avatar preview"
                >
                  <Avatar className="size-full">
                    <AvatarImage alt={user.displayName} src={avatarUrl} />
                    <AvatarFallback>{fallback}</AvatarFallback>
                  </Avatar>
                </ImagePreviewTrigger>
              }
              mediaClassName="size-10 rounded-full"
              mediaVariant="default"
              onAction={handleOpenAvatarCropDialog}
              status={avatarUrl ? 'Custom' : 'Default'}
              statusVariant={avatarUrl ? 'secondary' : 'outline'}
              title="Avatar"
            />

            <ItemSeparator className="!my-0" />

            <ProfileItem
              actionDisabled={profileBannerBusy}
              actionIcon={<ImageUpIcon />}
              actionLabel="Change"
              description="Displayed across the top of your profile."
              media={
                <ImagePreviewTrigger
                  imageAlt={`${user.displayName} profile banner`}
                  imageUrl={profileBannerUrl}
                  onOpenChange={(open) => setProfilePreviewTarget(open ? 'profileBanner' : null)}
                  open={profilePreviewTarget === 'profileBanner'}
                  title="Profile banner preview"
                >
                  <ImagePreviewMedia fallbackIcon={<ImageIcon className="size-4" />} imageUrl={profileBannerUrl} />
                </ImagePreviewTrigger>
              }
              mediaClassName="size-10 rounded-full"
              mediaVariant="default"
              onAction={handleOpenProfileBannerCropDialog}
              status={profileBannerUrl ? 'Custom' : 'Default'}
              statusVariant={profileBannerUrl ? 'secondary' : 'outline'}
              title="Profile banner"
            />

            <ItemSeparator className="!my-0" />

            <ProfileItem
              actionDisabled={profileBackgroundBusy}
              actionIcon={<ImageUpIcon />}
              actionLabel="Change"
              description="Used as the app background while you are signed in."
              media={
                <ImagePreviewTrigger
                  imageAlt={`${user.displayName} profile background`}
                  imageUrl={profileBackgroundUrl}
                  onOpenChange={(open) => setProfilePreviewTarget(open ? 'profileBackground' : null)}
                  open={profilePreviewTarget === 'profileBackground'}
                  title="Profile background preview"
                >
                  <ImagePreviewMedia
                    fallbackIcon={<WallpaperIcon className="size-4" />}
                    imageUrl={profileBackgroundUrl}
                  />
                </ImagePreviewTrigger>
              }
              mediaClassName="size-10 rounded-full"
              mediaVariant="default"
              onAction={handleOpenProfileBackgroundCropDialog}
              status={profileBackgroundUrl ? 'Custom' : 'Default'}
              statusVariant={profileBackgroundUrl ? 'secondary' : 'outline'}
              title="Profile background"
            />
          </ProfileSection>

          <ProfileSection title="Contact" description="Recovery and verification contact methods.">
            <ProfileItem
              actionDisabled={!emailVerificationAvailable}
              actionIcon={<MailIcon />}
              actionLabel={emailNeedsVerification ? 'Verify' : undefined}
              actionTooltip={
                emailNeedsVerification && !profileEmailVerificationEnabled
                  ? 'Email verification is unavailable because SMTP email is not configured.'
                  : undefined
              }
              description={user.email}
              icon={<MailIcon className="size-4" />}
              onAction={emailNeedsVerification ? handleStartEmailVerification : undefined}
              status={user.emailVerified ? 'Verified' : 'Unverified'}
              statusVariant={user.emailVerified ? 'secondary' : 'outline'}
              title="Email"
            />

            <ItemSeparator className="!my-0" />

            <ProfileItem
              actionLabel={user.phoneNumber ? 'Change' : 'Bind'}
              actionDisabled={!phoneBindingEnabled}
              actionIcon={<PhoneIcon />}
              actionTooltip={
                phoneBindingEnabled
                  ? undefined
                  : 'Phone binding is unavailable because SMS verification is not configured.'
              }
              description={user.phoneNumber ?? 'Not bound'}
              icon={<PhoneIcon className="size-4" />}
              onAction={handleEditPhoneNumber}
              status={user.phoneNumber ? (user.phoneVerified ? 'Verified' : 'Unverified') : undefined}
              statusVariant={user.phoneVerified ? 'secondary' : 'outline'}
              title="Phone"
            />
          </ProfileSection>

          {bindableSsoProviders.length > 0 ? (
            <ProfileSection title="Sign-in methods" description="Linked external sign-in providers.">
              <SsoProviderList
                identities={ssoIdentities}
                onBind={handleBindSsoProvider}
                providers={bindableSsoProviders}
              />
            </ProfileSection>
          ) : null}

          <ProfileSection title="Access" description="Assigned roles and permissions.">
            <ProfileItem
              description={formatRoleAccessSummary(user.roles, user.permissions)}
              icon={<UserCogIcon className="size-4" />}
              title="Roles"
            />
          </ProfileSection>
        </div>
      </div>
      <ImageCropDialog
        aspect={1}
        cropShape="round"
        description="Crop the avatar before uploading."
        error={avatarUploadError}
        imageSelectLabel="Select avatar"
        imageUrl={avatarCropImageUrl}
        loading={uploadingAvatar}
        maxFileBytes={profileImageMaxBytes}
        onImageSelect={handleAvatarSelect}
        onOpenChange={handleAvatarCropOpenChange}
        onRemove={avatarUrl ? handleDeleteAvatar : undefined}
        onSubmit={handleAvatarCropSubmit}
        open={avatarCropDialogOpen}
        output={{
          fileName: 'avatar.png',
          height: 512,
          width: 512,
        }}
        removeLabel="Remove"
        removeLoading={deletingAvatar}
        showGrid={false}
        submitLabel="Upload"
        title="Upload avatar"
      />
      <ImageCropDialog
        aspect={4}
        description="Crop and adjust the profile banner image."
        error={profileBannerUploadError}
        imageSelectLabel="Select profile banner"
        imageUrl={profileBannerCropImageUrl}
        loading={uploadingProfileBanner}
        maxFileBytes={profileImageMaxBytes}
        onImageSelect={handleProfileBannerSelect}
        onOpenChange={handleProfileBannerCropOpenChange}
        onRemove={profileBannerUrl ? handleDeleteProfileBanner : undefined}
        onSubmit={handleProfileBannerCropSubmit}
        open={profileBannerCropDialogOpen}
        output={{
          contentType: 'image/webp',
          fileName: 'profile-banner.webp',
          height: 400,
          width: 1600,
        }}
        removeLabel="Remove"
        removeLoading={deletingProfileBanner}
        showAdjustments
        submitLabel="Upload"
        title="Upload profile banner"
      />
      <ImageCropDialog
        aspect={16 / 9}
        description="Crop and adjust the profile background image."
        error={profileBackgroundUploadError}
        imageSelectLabel="Select profile background"
        imageUrl={profileBackgroundCropImageUrl}
        loading={uploadingProfileBackground}
        maxFileBytes={profileImageMaxBytes}
        onImageSelect={handleProfileBackgroundSelect}
        onOpenChange={handleProfileBackgroundCropOpenChange}
        onRemove={profileBackgroundUrl ? handleDeleteProfileBackground : undefined}
        onSubmit={handleProfileBackgroundCropSubmit}
        open={profileBackgroundCropDialogOpen}
        output={{
          contentType: 'image/webp',
          fileName: 'profile-background.webp',
          height: 1080,
          width: 1920,
        }}
        removeLabel="Remove"
        removeLoading={deletingProfileBackground}
        showAdjustments
        submitLabel="Upload"
        title="Upload profile background"
      />
      {pendingVerification ? (
        <IdentityVerificationDialog
          allowRecoveryCode
          defaultMethod={pendingVerification.challenge.defaultMethod}
          error={securityVerificationAction.error}
          methods={pendingVerification.challenge.methods}
          onClearError={securityVerificationAction.clearError}
          onOpenChange={(open: boolean) => (!open ? setPendingVerification(null) : undefined)}
          onSendCode={handleSendSecurityVerificationCode}
          onSubmit={handleConfirmSecurityVerification}
          open={Boolean(pendingVerification)}
          pending={securityVerificationAction.pending}
          sendPending={securityVerificationAction.pending}
        />
      ) : null}
      <EditProfileDetailsDialog
        changed={profileDetailsChanged}
        disabled={savingProfile}
        error={profileAction.error}
        onOpenChange={setEditingProfileDetails}
        onProfileDetailsChange={setProfileDetailsDraft}
        onSubmit={handleProfileSubmit}
        open={editingProfileDetails}
        profileDetails={profileDetailsDraft}
      />
      <EmailVerificationDialog
        code={emailVerificationCodeDraft}
        confirming={confirmingEmailVerification}
        delivery={emailVerificationNotice}
        email={user.email}
        error={emailVerificationSendAction.error ?? emailVerificationConfirmAction.error}
        onCodeChange={setEmailVerificationCodeDraft}
        onOpenChange={handleEmailVerificationOpenChange}
        onSendCode={requestProfileEmailVerificationCode}
        onSubmit={handleEmailVerificationSubmit}
        open={verifyingEmail}
        sending={sendingEmailVerification}
      />
      <PhoneVerificationDialog
        bindingEnabled={phoneBindingEnabled}
        code={phoneVerificationCodeDraft}
        confirming={confirmingPhoneVerification}
        countryCode={phoneCountryCodeDraft}
        countryCodes={phoneCountryCodes}
        delivery={phoneVerificationNotice}
        error={phoneVerificationSendAction.error ?? phoneVerificationConfirmAction.error}
        hasPhoneNumber={Boolean(user.phoneNumber)}
        localNumber={phoneLocalNumberDraft}
        onCodeChange={setPhoneVerificationCodeDraft}
        onCountryCodeChange={(countryCode) => {
          setPhoneCountryCodeDraft(countryCode);
          setPhoneVerificationCodeDraft('');
          setPhoneVerificationNotice(null);
        }}
        onLocalNumberChange={(value) => {
          setPhoneLocalNumberDraft(value);
          setPhoneVerificationCodeDraft('');
          setPhoneVerificationNotice(null);
        }}
        onOpenChange={handlePhoneNumberOpenChange}
        onSendCode={requestProfilePhoneVerificationCode}
        onSubmit={handlePhoneNumberSubmit}
        open={editingPhoneNumber}
        pending={phoneVerificationPending}
        required={phoneVerificationRequired}
        sending={sendingPhoneVerification}
      />
    </div>
  );
};

function createProfileDetailsDraft(user: AuthUser): ProfileDetailsDraft {
  return {
    displayName: user.displayName,
    gender: user.gender ?? '',
    birthday: user.birthday ?? '',
    bio: user.bio ?? '',
    location: user.location ?? '',
    websiteUrl: user.websiteUrl ?? '',
  };
}

function hasProfileDetailsChanged(left: ProfileDetailsDraft, right: ProfileDetailsDraft) {
  return (
    left.displayName !== right.displayName ||
    left.gender !== right.gender ||
    left.birthday !== right.birthday ||
    left.bio !== right.bio ||
    left.location !== right.location ||
    left.websiteUrl !== right.websiteUrl
  );
}

function parseProfileDetailsDraft(draft: ProfileDetailsDraft) {
  const displayName = displayNameSchema.safeParse(draft.displayName);

  if (!displayName.success) {
    return {
      success: false,
      error: displayName.error.issues[0]?.message ?? 'Display name is invalid.',
    } as const;
  }

  const gender = profileGenderSchema.safeParse(draft.gender);

  if (!gender.success) {
    return {
      success: false,
      error: gender.error.issues[0]?.message ?? 'Gender is invalid.',
    } as const;
  }

  const birthday = profileBirthdaySchema.safeParse(draft.birthday);

  if (!birthday.success) {
    return {
      success: false,
      error: birthday.error.issues[0]?.message ?? 'Birthday is invalid.',
    } as const;
  }

  const bio = profileBioSchema.safeParse(draft.bio);

  if (!bio.success) {
    return {
      success: false,
      error: bio.error.issues[0]?.message ?? 'Bio is invalid.',
    } as const;
  }

  const location = profileLocationSchema.safeParse(draft.location);

  if (!location.success) {
    return {
      success: false,
      error: location.error.issues[0]?.message ?? 'Location is invalid.',
    } as const;
  }

  const websiteUrl = profileWebsiteUrlSchema.safeParse(draft.websiteUrl);

  if (!websiteUrl.success) {
    return {
      success: false,
      error: websiteUrl.error.issues[0]?.message ?? 'Homepage is invalid.',
    } as const;
  }

  return {
    success: true,
    data: {
      displayName: displayName.data,
      gender: gender.data,
      birthday: birthday.data,
      bio: bio.data,
      location: location.data,
      websiteUrl: websiteUrl.data,
    },
  } as const;
}

function formatProfileDetail(value: string | undefined) {
  return value?.trim() || 'Not set';
}

function formatProfileLocation(value: string | undefined) {
  const locationLevels = value
    ?.split(',')
    .map((level) => level.trim())
    .filter(Boolean);

  return locationLevels?.length ? [...locationLevels].reverse().join(', ') : 'Not set';
}

export default Index;
