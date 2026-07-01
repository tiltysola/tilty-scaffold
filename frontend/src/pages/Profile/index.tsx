import { type SubmitEventHandler, useEffect, useMemo, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
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
import { formatDateOnlyValue } from '@/i18n';
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
import { createImageObjectUrl } from '@/lib/image-upload';
import { composePhoneNumber, getPhoneCountryCode, getPhoneLocalNumber, supportedPhoneCountryCodes } from '@/lib/phone';
import { getVerificationCodeDelivery, maskEmailAddress, maskPhoneNumber } from '@/lib/verification';
import { Avatar, AvatarFallback, AvatarImage } from '@/shadcn/components/ui/avatar';
import { ItemSeparator } from '@/shadcn/components/ui/item';
import {
  displayNameSchema,
  phoneNumberSchema,
  profileBioSchema,
  profileBirthdaySchema,
  profileGenderSchema,
  profileLocationSchema,
  profileWebsiteUrlSchema,
  verificationCodeSchema,
} from '@tilty/shared/validation';

import { IdentityVerificationDialog, type IdentityVerificationSubmitInput } from '@/components/IdentityVerification';
import ImageCropDialog from '@/components/ImageCropDialog';
import { ImagePreviewMedia, ImagePreviewTrigger } from '@/components/ImagePreviewDialog';
import { ProfileItem, ProfileSection } from '@/components/ProfileCardList';

import { EditProfileDetailsDialog, type ProfileDetailsDraft } from './components/EditProfileDetailsDialog';
import { EmailVerificationDialog } from './components/EmailVerificationDialog';
import { PhoneVerificationDialog } from './components/PhoneVerificationDialog';
import { ProfileHeader } from './components/ProfileHeader';
import { SsoProviderList } from './components/SsoProviderList';
import { formatRoleAccessSummary, getHashParams, syncPhoneDraft } from './utils';

interface PendingProfileVerification {
  challenge: VerificationRequired;
  onVerified: () => Promise<void>;
}

type ProfilePreviewTarget = 'avatar' | 'profileBackground' | 'profileBanner' | null;

const Index = () => {
  const { user } = useAuthenticatedSession();

  return <ProfileContent user={user} />;
};

const ProfileContent = ({ user }: { user: AuthUser }) => {
  const [profileDetailsDraft, setProfileDetailsDraft] = useState<ProfileDetailsDraft>(() =>
    createProfileDetailsDraft(user),
  );
  const [editingProfileDetails, setEditingProfileDetails] = useState(false);
  const [avatarCropDialogOpen, setAvatarCropDialogOpen] = useState(false);
  const [avatarCropImageUrl, setAvatarCropImageUrl] = useState<string | null>(null);
  const [avatarUploadError, setAvatarUploadError] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [deletingAvatar, setDeletingAvatar] = useState(false);
  const [profileBannerCropDialogOpen, setProfileBannerCropDialogOpen] = useState(false);
  const [profileBannerCropImageUrl, setProfileBannerCropImageUrl] = useState<string | null>(null);
  const [profileBannerUploadError, setProfileBannerUploadError] = useState<string | null>(null);
  const [uploadingProfileBanner, setUploadingProfileBanner] = useState(false);
  const [deletingProfileBanner, setDeletingProfileBanner] = useState(false);
  const [profileBackgroundCropDialogOpen, setProfileBackgroundCropDialogOpen] = useState(false);
  const [profileBackgroundCropImageUrl, setProfileBackgroundCropImageUrl] = useState<string | null>(null);
  const [profileBackgroundUploadError, setProfileBackgroundUploadError] = useState<string | null>(null);
  const [uploadingProfileBackground, setUploadingProfileBackground] = useState(false);
  const [deletingProfileBackground, setDeletingProfileBackground] = useState(false);
  const [profilePreviewTarget, setProfilePreviewTarget] = useState<ProfilePreviewTarget>(null);
  const [authConfigLoaded, setAuthConfigLoaded] = useState(false);
  const [profileImageMaxBytes, setProfileImageMaxBytes] = useState<number | null>(null);
  const [profileEmailVerificationEnabled, setProfileEmailVerificationEnabled] = useState(false);
  const [verifyingEmail, setVerifyingEmail] = useState(false);
  const [emailVerificationCodeDraft, setEmailVerificationCodeDraft] = useState('');
  const [emailVerificationNotice, setEmailVerificationNotice] =
    useState<ReturnType<typeof getVerificationCodeDelivery>>(null);
  const initialPhoneCountryCode = getPhoneCountryCode(user.phoneNumber, supportedPhoneCountryCodes) ?? '+86';
  const [phoneCountryCodes, setPhoneCountryCodes] = useState<PhoneCountryCode[]>([]);
  const [phoneCountryCodeDraft, setPhoneCountryCodeDraft] = useState<PhoneCountryCode>(initialPhoneCountryCode);
  const [phoneLocalNumberDraft, setPhoneLocalNumberDraft] = useState(
    getPhoneLocalNumber(user.phoneNumber, initialPhoneCountryCode),
  );
  const [editingPhoneNumber, setEditingPhoneNumber] = useState(false);
  const [phoneVerificationCodeDraft, setPhoneVerificationCodeDraft] = useState('');
  const [phoneVerificationNotice, setPhoneVerificationNotice] =
    useState<ReturnType<typeof getVerificationCodeDelivery>>(null);
  const [ssoConfig, setSsoConfig] = useState<SsoPublicConfig | null>(null);
  const [ssoIdentities, setSsoIdentities] = useState<SsoIdentityPublic[]>([]);
  const [pendingVerification, setPendingVerification] = useState<PendingProfileVerification | null>(null);
  const profileHeaderRef = useRef<HTMLElement | null>(null);
  const profileHeaderTextRef = useRef<HTMLDivElement | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const intl = useIntl();
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
  const phoneNumberDraft = useMemo(
    () => composePhoneNumber({ phoneCountryCode: phoneCountryCodeDraft, phoneLocalNumber: phoneLocalNumberDraft }),
    [phoneCountryCodeDraft, phoneLocalNumberDraft],
  );
  const bindableSsoProviders = useMemo(() => {
    const boundProviderIds = new Set(ssoIdentities.map((identity) => identity.providerId));

    return (ssoConfig?.providers ?? []).filter(
      (provider) => provider.bindingEnabled && !boundProviderIds.has(provider.id),
    );
  }, [ssoConfig?.providers, ssoIdentities]);
  const fallback = getUserInitials(user.displayName);
  const userHandle = getUserHandle(user.username);
  const profileDetailsChanged = hasProfileDetailsChanged(profileDetailsDraft, createProfileDetailsDraft(user));
  const profileImageUploadEnabled = profileImageMaxBytes !== null;
  const emailNeedsVerification = !user.emailVerified;
  const emailVerificationAvailable = emailNeedsVerification && profileEmailVerificationEnabled;
  const emailVerificationActionVisible = authConfigLoaded && emailNeedsVerification;
  const phoneActionVisible = authConfigLoaded;
  const phoneBindingEnabled = authConfigLoaded && phoneCountryCodes.length > 0;
  const phoneVerificationRequired = phoneBindingEnabled && phoneLocalNumberDraft.trim().length > 0;
  const avatarBusy = uploadingAvatar || deletingAvatar;
  const profileBannerBusy = uploadingProfileBanner || deletingProfileBanner;
  const profileBackgroundBusy = uploadingProfileBackground || deletingProfileBackground;
  const savingProfile = profileAction.pending;
  const sendingEmailVerification = emailVerificationSendAction.pending;
  const confirmingEmailVerification = emailVerificationConfirmAction.pending;
  const sendingPhoneVerification = phoneVerificationSendAction.pending;
  const confirmingPhoneVerification = phoneVerificationConfirmAction.pending;
  const phoneVerificationPending = sendingPhoneVerification || confirmingPhoneVerification;
  const profileHeaderTitleClassName =
    profileHeaderTextTone === 'light'
      ? 'truncate text-xl font-semibold tracking-normal text-white drop-shadow'
      : profileHeaderTextTone === 'dark'
        ? 'truncate text-xl font-semibold tracking-normal text-black'
        : 'truncate text-xl font-semibold tracking-normal';
  const profileHeaderDescriptionClassName =
    profileHeaderTextTone === 'light'
      ? 'truncate text-sm text-white/85 drop-shadow'
      : profileHeaderTextTone === 'dark'
        ? 'truncate text-sm text-black/70'
        : 'truncate text-sm text-muted-foreground';
  const profileHeaderActionClassName =
    profileHeaderTextTone === 'light'
      ? 'text-white hover:bg-white/15 hover:text-white'
      : profileHeaderTextTone === 'dark'
        ? 'text-black hover:bg-black/10 hover:text-black'
        : undefined;
  const syncProfileState = (updatedUser: AuthUser) => {
    setProfileDetailsDraft(createProfileDetailsDraft(updatedUser));
    syncPhoneDraft(updatedUser.phoneNumber, phoneCountryCodes, setPhoneCountryCodeDraft, setPhoneLocalNumberDraft);
  };

  useEffect(() => {
    const hashParams = getHashParams(location.hash);

    if (hashParams.get('sso_profile_bind') !== 'success') {
      return;
    }

    toast.success(intl.formatMessage({ id: 'profile.sso.bound.success' }));
    navigate(location.pathname, { replace: true });
    void fetchSsoIdentities()
      .then((result) => setSsoIdentities(result.identities))
      .catch((error: unknown) => {
        toast.error(getApiErrorMessage(error, intl.formatMessage({ id: 'profile.sso.identities.load.failed' })));
      });
  }, [intl, location.hash, location.pathname, navigate]);

  useEffect(() => {
    let isActive = true;

    void fetchAuthConfig()
      .then((config) => {
        if (!isActive) {
          return;
        }

        setAuthConfigLoaded(true);
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
          toast.error(getApiErrorMessage(error, intl.formatMessage({ id: 'profile.configuration.load.failed' })));
        }
      });

    return () => {
      isActive = false;
    };
  }, [intl, user.phoneNumber]);

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
          toast.error(getApiErrorMessage(error, intl.formatMessage({ id: 'profile.sso.configuration.load.failed' })));
        }
      });

    return () => {
      isActive = false;
    };
  }, [intl]);

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
    if (!profileImageUploadEnabled) {
      return;
    }

    setAvatarUploadError(null);
    setAvatarCropDialogOpen(true);
  };

  const handleAvatarSelect = (file: File) => {
    const imageUrl = createImageObjectUrl(
      file,
      setAvatarUploadError,
      intl.formatMessage({ id: 'profile.image.type.error' }),
    );

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
      toast.success(intl.formatMessage({ id: 'profile.avatar.updated' }));
    } catch (error) {
      const message = getApiErrorMessage(error, intl.formatMessage({ id: 'profile.avatar.upload.failed' }));

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
      toast.success(intl.formatMessage({ id: 'profile.avatar.removed' }));
    } catch (error) {
      toast.error(
        getApiErrorMessage(
          error,
          intl.formatMessage(
            { id: 'profile.image.remove.failed' },
            { label: intl.formatMessage({ id: 'profile.avatar' }) },
          ),
        ),
      );
    } finally {
      setDeletingAvatar(false);
    }
  };

  const handleOpenProfileBannerCropDialog = () => {
    if (!profileImageUploadEnabled) {
      return;
    }

    setProfileBannerUploadError(null);
    setProfileBannerCropDialogOpen(true);
  };

  const handleProfileBannerSelect = (file: File) => {
    const imageUrl = createImageObjectUrl(
      file,
      setProfileBannerUploadError,
      intl.formatMessage({ id: 'profile.image.type.error' }),
    );

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
      toast.success(intl.formatMessage({ id: 'profile.banner.updated' }));
    } catch (error) {
      const message = getApiErrorMessage(
        error,
        intl.formatMessage(
          { id: 'profile.image.upload.failed' },
          { label: intl.formatMessage({ id: 'profile.banner' }) },
        ),
      );

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
      toast.success(intl.formatMessage({ id: 'profile.banner.removed' }));
    } catch (error) {
      toast.error(
        getApiErrorMessage(
          error,
          intl.formatMessage(
            { id: 'profile.image.remove.failed' },
            { label: intl.formatMessage({ id: 'profile.banner' }) },
          ),
        ),
      );
    } finally {
      setDeletingProfileBanner(false);
    }
  };

  const handleOpenProfileBackgroundCropDialog = () => {
    if (!profileImageUploadEnabled) {
      return;
    }

    setProfileBackgroundUploadError(null);
    setProfileBackgroundCropDialogOpen(true);
  };

  const handleProfileBackgroundSelect = (file: File) => {
    const imageUrl = createImageObjectUrl(
      file,
      setProfileBackgroundUploadError,
      intl.formatMessage({ id: 'profile.image.type.error' }),
    );

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
      toast.success(intl.formatMessage({ id: 'profile.background.updated' }));
    } catch (error) {
      const message = getApiErrorMessage(
        error,
        intl.formatMessage(
          { id: 'profile.image.upload.failed' },
          { label: intl.formatMessage({ id: 'profile.background' }) },
        ),
      );

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
      toast.success(intl.formatMessage({ id: 'profile.background.removed' }));
    } catch (error) {
      toast.error(
        getApiErrorMessage(
          error,
          intl.formatMessage(
            { id: 'profile.image.remove.failed' },
            { label: intl.formatMessage({ id: 'profile.background' }) },
          ),
        ),
      );
    } finally {
      setDeletingProfileBackground(false);
    }
  };

  const handleProfileSubmit: SubmitEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    profileAction.clearError();

    const parsed = parseProfileDetailsDraft(profileDetailsDraft);

    if (!parsed.success) {
      profileAction.setError(intl.formatMessage({ id: parsed.error ?? 'profile.profile.update.failed' }));
      return;
    }

    const updatedUser = await profileAction.run(
      () => updateCurrentUser(parsed.data),
      intl.formatMessage({ id: 'profile.profile.update.failed' }),
    );

    if (updatedUser) {
      syncProfileState(updatedUser);
      setEditingProfileDetails(false);
      toast.success(intl.formatMessage({ id: 'profile.profile.updated' }));
    }
  };

  const requestProfileEmailVerificationCode = async () => {
    setEmailVerificationNotice(null);
    emailVerificationSendAction.clearError();

    const result = await emailVerificationSendAction.run(
      () => sendProfileEmailVerification(),
      intl.formatMessage({ id: 'identity.verification.code.send.failed' }),
    );

    if (result) {
      setEmailVerificationNotice(
        getVerificationCodeDelivery('email', maskEmailAddress(user.email), intl.formatMessage),
      );
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
      emailVerificationConfirmAction.setError(
        intl.formatMessage({ id: parsed.error.issues[0]?.message ?? 'validation.verification.code.invalid' }),
      );
      return;
    }

    const updatedUser = await emailVerificationConfirmAction.run(
      () =>
        verifyProfileEmail({
          emailVerificationCode: parsed.data,
        }),
      intl.formatMessage({ id: 'profile.email.verification.failed' }),
    );

    if (updatedUser) {
      syncProfileState(updatedUser);
      setVerifyingEmail(false);
      setEmailVerificationNotice(null);
      toast.success(intl.formatMessage({ id: 'profile.email.verified' }));
    }
  };

  const parsePhoneNumberDraft = () => {
    if (!phoneBindingEnabled) {
      return {
        error: intl.formatMessage({ id: 'profile.phone.binding.unavailable' }),
        phoneNumber: undefined,
      };
    }

    const parsed = phoneNumberSchema.safeParse(phoneNumberDraft);

    if (!parsed.success) {
      return {
        error: intl.formatMessage({ id: parsed.error.issues[0]?.message ?? 'validation.phone.number.invalid' }),
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
      intl.formatMessage({ id: 'identity.security.verification.start.failed' }),
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
      intl.formatMessage({ id: 'identity.security.verification.start.failed' }),
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
      phoneVerificationSendAction.setError(
        parsed.error ?? intl.formatMessage({ id: 'validation.phone.number.invalid' }),
      );
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
      intl.formatMessage({ id: 'identity.verification.code.send.failed' }),
    );

    if (result) {
      setPhoneVerificationNotice(getVerificationCodeDelivery('sms', maskPhoneNumber(phoneNumber), intl.formatMessage));
    }
  };

  const handlePhoneNumberSubmit: SubmitEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    phoneVerificationConfirmAction.clearError();

    const parsed = parsePhoneNumberDraft();

    if (!parsed.phoneNumber) {
      phoneVerificationConfirmAction.setError(
        parsed.error ?? intl.formatMessage({ id: 'validation.phone.number.invalid' }),
      );
      return;
    }

    const parsedCode = verificationCodeSchema.safeParse(phoneVerificationCodeDraft);

    if (!parsedCode.success) {
      phoneVerificationConfirmAction.setError(
        intl.formatMessage({ id: parsedCode.error.issues[0]?.message ?? 'validation.verification.code.invalid' }),
      );
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
      intl.formatMessage({ id: 'profile.phone.verification.failed' }),
    );

    if (updatedUser) {
      syncProfileState(updatedUser);
      setPhoneVerificationCodeDraft('');
      setPhoneVerificationNotice(null);
      setEditingPhoneNumber(false);
      toast.success(intl.formatMessage({ id: 'profile.phone.number.verified' }));
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
      intl.formatMessage({ id: 'identity.verification.code.send.failed' }),
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
            intl.formatMessage({ id: 'identity.passkey.verification.failed' }),
          )
        : await securityVerificationAction.run(
            () =>
              verifyAuthenticationChallenge({
                verificationToken: pendingVerification.challenge.verificationToken,
                ...input,
              }),
            intl.formatMessage({ id: 'identity.verification.failed' }),
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
        <h1 className="text-2xl font-semibold tracking-normal">{intl.formatMessage({ id: 'profile.title' })}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">{intl.formatMessage({ id: 'profile.description' })}</p>
      </div>

      <div className="grid gap-8">
        <ProfileHeader
          actionClassName={profileHeaderActionClassName}
          avatarAlt={user.displayName}
          avatarBusy={avatarBusy}
          avatarUrl={avatarUrl}
          backgroundBusy={profileBackgroundBusy}
          bannerBusy={profileBannerBusy}
          bannerUrl={profileBannerUrl}
          descriptionClassName={profileHeaderDescriptionClassName}
          fallback={fallback}
          onChangeAvatar={profileImageUploadEnabled ? handleOpenAvatarCropDialog : undefined}
          onChangeBackground={profileImageUploadEnabled ? handleOpenProfileBackgroundCropDialog : undefined}
          onChangeBanner={profileImageUploadEnabled ? handleOpenProfileBannerCropDialog : undefined}
          onEditProfileDetails={handleEditProfileDetails}
          sectionRef={profileHeaderRef}
          textRef={profileHeaderTextRef}
          title={user.displayName}
          titleClassName={profileHeaderTitleClassName}
          uploadingAvatar={uploadingAvatar}
          uploadingBackground={uploadingProfileBackground}
          uploadingBanner={uploadingProfileBanner}
          userHandle={userHandle}
        />

        <div className="grid gap-8">
          <ProfileSection
            actionIcon={<UserPenIcon />}
            actionLabel={intl.formatMessage({ id: 'common.edit' })}
            description={intl.formatMessage({ id: 'profile.details.description' })}
            onAction={handleEditProfileDetails}
            title={intl.formatMessage({ id: 'profile.details' })}
          >
            <ProfileItem
              description={user.displayName}
              icon={<UserPenIcon className="size-4" />}
              title={intl.formatMessage({ id: 'profile.display.name' })}
            />

            <ItemSeparator className="!my-0" />

            <ProfileItem
              description={formatProfileDetail(user.bio, intl.formatMessage({ id: 'common.not.set' }))}
              icon={<FileTextIcon className="size-4" />}
              title={intl.formatMessage({ id: 'profile.bio' })}
            />

            <ItemSeparator className="!my-0" />

            <ProfileItem
              description={formatProfileDetail(user.gender, intl.formatMessage({ id: 'common.not.set' }))}
              icon={<UserRoundIcon className="size-4" />}
              title={intl.formatMessage({ id: 'profile.gender' })}
            />

            <ItemSeparator className="!my-0" />

            <ProfileItem
              description={formatProfileBirthday(
                user.birthday,
                intl.formatMessage({ id: 'common.not.set' }),
                intl.locale,
              )}
              icon={<CalendarDaysIcon className="size-4" />}
              title={intl.formatMessage({ id: 'profile.birthday' })}
            />

            <ItemSeparator className="!my-0" />

            <ProfileItem
              description={formatProfileLocation(user.location, intl.formatMessage({ id: 'common.not.set' }))}
              icon={<MapPinIcon className="size-4" />}
              title={intl.formatMessage({ id: 'profile.location' })}
            />

            <ItemSeparator className="!my-0" />

            <ProfileItem
              description={formatProfileDetail(user.websiteUrl, intl.formatMessage({ id: 'common.not.set' }))}
              icon={<LinkIcon className="size-4" />}
              title={intl.formatMessage({ id: 'profile.homepage' })}
            />
          </ProfileSection>

          <ProfileSection
            title={intl.formatMessage({ id: 'profile.personalization' })}
            description={intl.formatMessage({ id: 'profile.personalization.description' })}
          >
            <ProfileItem
              actionDisabled={avatarBusy}
              actionIcon={<ImageUpIcon />}
              actionLabel={profileImageUploadEnabled ? intl.formatMessage({ id: 'common.change' }) : undefined}
              description={intl.formatMessage({ id: 'profile.personalization.avatar.description' })}
              media={
                <ImagePreviewTrigger
                  imageAlt={intl.formatMessage({ id: 'profile.avatar.alt' }, { name: user.displayName })}
                  imageUrl={avatarUrl}
                  onOpenChange={(open) => setProfilePreviewTarget(open ? 'avatar' : null)}
                  open={profilePreviewTarget === 'avatar'}
                  title={intl.formatMessage({ id: 'profile.avatar.preview' })}
                >
                  <Avatar className="size-full">
                    <AvatarImage alt={user.displayName} src={avatarUrl} />
                    <AvatarFallback>{fallback}</AvatarFallback>
                  </Avatar>
                </ImagePreviewTrigger>
              }
              mediaClassName="size-10 rounded-full"
              mediaVariant="default"
              onAction={profileImageUploadEnabled ? handleOpenAvatarCropDialog : undefined}
              status={intl.formatMessage({ id: avatarUrl ? 'common.custom' : 'common.default' })}
              statusVariant={avatarUrl ? 'secondary' : 'outline'}
              title={intl.formatMessage({ id: 'profile.avatar' })}
            />

            <ItemSeparator className="!my-0" />

            <ProfileItem
              actionDisabled={profileBannerBusy}
              actionIcon={<ImageUpIcon />}
              actionLabel={profileImageUploadEnabled ? intl.formatMessage({ id: 'common.change' }) : undefined}
              description={intl.formatMessage({ id: 'profile.personalization.banner.description' })}
              media={
                <ImagePreviewTrigger
                  imageAlt={intl.formatMessage({ id: 'profile.banner.alt' }, { name: user.displayName })}
                  imageUrl={profileBannerUrl}
                  onOpenChange={(open) => setProfilePreviewTarget(open ? 'profileBanner' : null)}
                  open={profilePreviewTarget === 'profileBanner'}
                  title={intl.formatMessage({ id: 'profile.banner.preview' })}
                >
                  <ImagePreviewMedia fallbackIcon={<ImageIcon className="size-4" />} imageUrl={profileBannerUrl} />
                </ImagePreviewTrigger>
              }
              mediaClassName="size-10 rounded-full"
              mediaVariant="default"
              onAction={profileImageUploadEnabled ? handleOpenProfileBannerCropDialog : undefined}
              status={intl.formatMessage({ id: profileBannerUrl ? 'common.custom' : 'common.default' })}
              statusVariant={profileBannerUrl ? 'secondary' : 'outline'}
              title={intl.formatMessage({ id: 'profile.banner' })}
            />

            <ItemSeparator className="!my-0" />

            <ProfileItem
              actionDisabled={profileBackgroundBusy}
              actionIcon={<ImageUpIcon />}
              actionLabel={profileImageUploadEnabled ? intl.formatMessage({ id: 'common.change' }) : undefined}
              description={intl.formatMessage({ id: 'profile.personalization.background.description' })}
              media={
                <ImagePreviewTrigger
                  imageAlt={intl.formatMessage({ id: 'profile.background.alt' }, { name: user.displayName })}
                  imageUrl={profileBackgroundUrl}
                  onOpenChange={(open) => setProfilePreviewTarget(open ? 'profileBackground' : null)}
                  open={profilePreviewTarget === 'profileBackground'}
                  title={intl.formatMessage({ id: 'profile.background.preview' })}
                >
                  <ImagePreviewMedia
                    fallbackIcon={<WallpaperIcon className="size-4" />}
                    imageUrl={profileBackgroundUrl}
                  />
                </ImagePreviewTrigger>
              }
              mediaClassName="size-10 rounded-full"
              mediaVariant="default"
              onAction={profileImageUploadEnabled ? handleOpenProfileBackgroundCropDialog : undefined}
              status={intl.formatMessage({ id: profileBackgroundUrl ? 'common.custom' : 'common.default' })}
              statusVariant={profileBackgroundUrl ? 'secondary' : 'outline'}
              title={intl.formatMessage({ id: 'profile.background' })}
            />
          </ProfileSection>

          <ProfileSection
            title={intl.formatMessage({ id: 'profile.contact' })}
            description={intl.formatMessage({ id: 'profile.contact.description' })}
          >
            <ProfileItem
              actionDisabled={!emailVerificationAvailable}
              actionIcon={emailVerificationActionVisible ? <MailIcon /> : undefined}
              actionLabel={emailVerificationActionVisible ? intl.formatMessage({ id: 'identity.verify' }) : undefined}
              actionTooltip={
                emailVerificationActionVisible && !profileEmailVerificationEnabled
                  ? intl.formatMessage({ id: 'profile.email.verification.unavailable' })
                  : undefined
              }
              description={user.email}
              icon={<MailIcon className="size-4" />}
              onAction={emailVerificationActionVisible ? handleStartEmailVerification : undefined}
              status={intl.formatMessage({ id: user.emailVerified ? 'common.verified' : 'common.unverified' })}
              statusVariant={user.emailVerified ? 'secondary' : 'outline'}
              title={intl.formatMessage({ id: 'profile.email' })}
            />

            <ItemSeparator className="!my-0" />

            <ProfileItem
              actionDisabled={!phoneBindingEnabled}
              actionIcon={phoneActionVisible ? <PhoneIcon /> : undefined}
              actionLabel={
                phoneActionVisible
                  ? intl.formatMessage({ id: user.phoneNumber ? 'common.change' : 'common.bind' })
                  : undefined
              }
              actionTooltip={
                phoneActionVisible && !phoneBindingEnabled
                  ? intl.formatMessage({ id: 'profile.phone.binding.unavailable' })
                  : undefined
              }
              description={user.phoneNumber ?? intl.formatMessage({ id: 'common.not.bound' })}
              icon={<PhoneIcon className="size-4" />}
              onAction={phoneActionVisible ? handleEditPhoneNumber : undefined}
              status={
                user.phoneNumber
                  ? intl.formatMessage({ id: user.phoneVerified ? 'common.verified' : 'common.unverified' })
                  : undefined
              }
              statusVariant={user.phoneVerified ? 'secondary' : 'outline'}
              title={intl.formatMessage({ id: 'profile.phone' })}
            />
          </ProfileSection>

          {bindableSsoProviders.length > 0 ? (
            <ProfileSection
              title={intl.formatMessage({ id: 'profile.sign.in.methods' })}
              description={intl.formatMessage({ id: 'profile.sign.in.methods.description' })}
            >
              <SsoProviderList
                identities={ssoIdentities}
                onBind={handleBindSsoProvider}
                providers={bindableSsoProviders}
              />
            </ProfileSection>
          ) : null}

          <ProfileSection
            title={intl.formatMessage({ id: 'profile.access' })}
            description={intl.formatMessage({ id: 'profile.access.description' })}
          >
            <ProfileItem
              description={formatRoleAccessSummary(
                user.roles,
                user.permissions,
                intl.formatMessage({ id: 'profile.no.roles' }),
              )}
              icon={<UserCogIcon className="size-4" />}
              title={intl.formatMessage({ id: 'profile.roles' })}
            />
          </ProfileSection>
        </div>
      </div>
      <ImageCropDialog
        aspect={1}
        cropShape="round"
        description={intl.formatMessage({ id: 'profile.personalization.avatar.upload.description' })}
        error={avatarUploadError}
        imageSelectLabel={intl.formatMessage({ id: 'profile.image.select' })}
        imageUrl={avatarCropImageUrl}
        loading={uploadingAvatar}
        maxFileBytes={profileImageMaxBytes ?? undefined}
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
        removeLabel={intl.formatMessage({ id: 'common.remove' })}
        removeLoading={deletingAvatar}
        showGrid={false}
        submitLabel={intl.formatMessage({ id: 'common.upload' })}
        title={intl.formatMessage({ id: 'profile.image.upload.avatar' })}
      />
      <ImageCropDialog
        aspect={4}
        description={intl.formatMessage({ id: 'profile.personalization.banner.upload.description' })}
        error={profileBannerUploadError}
        imageSelectLabel={intl.formatMessage({ id: 'profile.image.select' })}
        imageUrl={profileBannerCropImageUrl}
        loading={uploadingProfileBanner}
        maxFileBytes={profileImageMaxBytes ?? undefined}
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
        removeLabel={intl.formatMessage({ id: 'common.remove' })}
        removeLoading={deletingProfileBanner}
        showAdjustments
        submitLabel={intl.formatMessage({ id: 'common.upload' })}
        title={intl.formatMessage({ id: 'profile.image.upload.banner' })}
      />
      <ImageCropDialog
        aspect={16 / 9}
        description={intl.formatMessage({ id: 'profile.personalization.background.upload.description' })}
        error={profileBackgroundUploadError}
        imageSelectLabel={intl.formatMessage({ id: 'profile.image.select' })}
        imageUrl={profileBackgroundCropImageUrl}
        loading={uploadingProfileBackground}
        maxFileBytes={profileImageMaxBytes ?? undefined}
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
        removeLabel={intl.formatMessage({ id: 'common.remove' })}
        removeLoading={deletingProfileBackground}
        showAdjustments
        submitLabel={intl.formatMessage({ id: 'common.upload' })}
        title={intl.formatMessage({ id: 'profile.image.upload.background' })}
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
      error: displayName.error.issues[0]?.message ?? 'validation.display.name.invalid',
    } as const;
  }

  const gender = profileGenderSchema.safeParse(draft.gender);

  if (!gender.success) {
    return {
      success: false,
      error: gender.error.issues[0]?.message ?? 'validation.profile.gender.invalid',
    } as const;
  }

  const birthday = profileBirthdaySchema.safeParse(draft.birthday);

  if (!birthday.success) {
    return {
      success: false,
      error: birthday.error.issues[0]?.message ?? 'validation.birthday.invalid',
    } as const;
  }

  const bio = profileBioSchema.safeParse(draft.bio);

  if (!bio.success) {
    return {
      success: false,
      error: bio.error.issues[0]?.message ?? 'validation.profile.bio.invalid',
    } as const;
  }

  const location = profileLocationSchema.safeParse(draft.location);

  if (!location.success) {
    return {
      success: false,
      error: location.error.issues[0]?.message ?? 'validation.profile.location.invalid',
    } as const;
  }

  const websiteUrl = profileWebsiteUrlSchema.safeParse(draft.websiteUrl);

  if (!websiteUrl.success) {
    return {
      success: false,
      error: websiteUrl.error.issues[0]?.message ?? 'validation.homepage.url.invalid',
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

function formatProfileDetail(value: string | undefined, fallback: string) {
  return value?.trim() || fallback;
}

function formatProfileBirthday(value: string | undefined, fallback: string, locale: string) {
  const normalizedValue = value?.trim();

  return normalizedValue ? formatDateOnlyValue(normalizedValue, locale) : fallback;
}

function formatProfileLocation(value: string | undefined, fallback: string) {
  const locationLevels = value
    ?.split(',')
    .map((level) => level.trim())
    .filter(Boolean);

  return locationLevels?.length ? [...locationLevels].reverse().join(', ') : fallback;
}

export default Index;
