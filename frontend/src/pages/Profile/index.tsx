import { type SubmitEventHandler, useEffect, useMemo, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { useLocation, useNavigate } from 'react-router-dom';

import { toast } from 'sonner';

import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useAuthenticatedSession } from '@/hooks/useAuth';
import { useImageTextTone } from '@/hooks/useImageTextTone';
import { getApiErrorMessage } from '@/lib/api';
import {
  type AuthUser,
  createVerificationChallenge,
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
  type VerificationRequired,
  verifyAuthenticationChallenge,
  verifyProfileEmail,
  verifyProfilePhone,
  verifyWithPasskey,
} from '@/lib/auth';
import { composePhoneNumber, getPhoneCountryCode, getPhoneLocalNumber, supportedPhoneCountryCodes } from '@/lib/phone';
import { getVerificationCodeDelivery, maskEmailAddress, maskPhoneNumber } from '@/lib/verification';
import { AuthVerificationPurpose } from '@tilty/shared/auth';
import { phoneNumberSchema, verificationCodeSchema } from '@tilty/shared/validation';

import { IdentityVerificationDialog, type IdentityVerificationSubmitInput } from '@/components/IdentityVerification';

import { EditProfileDetailsDialog } from './components/EditProfileDetailsDialog';
import { EmailVerificationDialog } from './components/EmailVerificationDialog';
import { PhoneVerificationDialog } from './components/PhoneVerificationDialog';
import { ProfileAccessSection } from './components/ProfileAccessSection';
import { ProfileContactSection } from './components/ProfileContactSection';
import { ProfileDetailsSection } from './components/ProfileDetailsSection';
import { ProfileHeader } from './components/ProfileHeader';
import { ProfileImageCropDialogs } from './components/ProfileImageCropDialogs';
import { ProfilePersonalizationSection, type ProfilePreviewTarget } from './components/ProfilePersonalizationSection';
import { ProfileSsoSection } from './components/ProfileSsoSection';
import { useProfileImageUploads } from './hooks/useProfileImageUploads';
import {
  createProfileDetailsDraft,
  getHashParams,
  hasProfileDetailsChanged,
  parseProfileDetailsDraft,
  type ProfileDetailsDraft,
  syncPhoneDraft,
} from './utils';

interface PendingProfileVerification {
  challenge: VerificationRequired;
  onVerified: () => Promise<void>;
}

const Index = () => {
  const { user } = useAuthenticatedSession();

  return <ProfileContent user={user} />;
};

const ProfileContent = ({ user }: { user: AuthUser }) => {
  const [profileDetailsDraft, setProfileDetailsDraft] = useState<ProfileDetailsDraft>(() =>
    createProfileDetailsDraft(user),
  );
  const [editingProfileDetails, setEditingProfileDetails] = useState(false);
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
  const profileImages = useProfileImageUploads({
    enabled: profileImageUploadEnabled,
    onUserUpdated: syncProfileState,
  });
  const avatarBusy = profileImages.avatar.busy;
  const profileBannerBusy = profileImages.profileBanner.busy;
  const profileBackgroundBusy = profileImages.profileBackground.busy;
  const deletingAvatar = profileImages.avatar.deletePending;
  const deletingProfileBanner = profileImages.profileBanner.deletePending;
  const deletingProfileBackground = profileImages.profileBackground.deletePending;
  const uploadingAvatar = profileImages.avatar.uploadPending;
  const uploadingProfileBanner = profileImages.profileBanner.uploadPending;
  const uploadingProfileBackground = profileImages.profileBackground.uploadPending;

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
      () => createVerificationChallenge(AuthVerificationPurpose.UpdateContact),
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
      () => createVerificationChallenge(AuthVerificationPurpose.ManageSso),
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
          descriptionClassName={profileHeaderDescriptionClassName}
          fallback={fallback}
          onChangeAvatar={profileImageUploadEnabled ? profileImages.avatar.openDialog : undefined}
          onChangeBanner={profileImageUploadEnabled ? profileImages.profileBanner.openDialog : undefined}
          onChangeBackground={profileImageUploadEnabled ? profileImages.profileBackground.openDialog : undefined}
          onEditProfileDetails={handleEditProfileDetails}
          profileBannerBusy={profileBannerBusy}
          profileBannerUrl={profileBannerUrl}
          profileBackgroundBusy={profileBackgroundBusy}
          sectionRef={profileHeaderRef}
          textRef={profileHeaderTextRef}
          title={user.displayName}
          titleClassName={profileHeaderTitleClassName}
          uploadingAvatar={uploadingAvatar}
          uploadingProfileBanner={uploadingProfileBanner}
          uploadingProfileBackground={uploadingProfileBackground}
          userHandle={userHandle}
        />

        <div className="grid gap-8">
          <ProfileDetailsSection onEdit={handleEditProfileDetails} user={user} />

          <ProfilePersonalizationSection
            avatarBusy={avatarBusy}
            avatarUrl={avatarUrl}
            fallback={fallback}
            imageUploadEnabled={profileImageUploadEnabled}
            onChangeAvatar={profileImages.avatar.openDialog}
            onChangeBanner={profileImages.profileBanner.openDialog}
            onChangeBackground={profileImages.profileBackground.openDialog}
            onPreviewTargetChange={setProfilePreviewTarget}
            previewTarget={profilePreviewTarget}
            profileBannerBusy={profileBannerBusy}
            profileBannerUrl={profileBannerUrl}
            profileBackgroundBusy={profileBackgroundBusy}
            profileBackgroundUrl={profileBackgroundUrl}
            userDisplayName={user.displayName}
          />

          <ProfileContactSection
            emailVerificationActionVisible={emailVerificationActionVisible}
            emailVerificationAvailable={emailVerificationAvailable}
            onEditPhoneNumber={handleEditPhoneNumber}
            onStartEmailVerification={handleStartEmailVerification}
            phoneActionVisible={phoneActionVisible}
            phoneBindingEnabled={phoneBindingEnabled}
            profileEmailVerificationEnabled={profileEmailVerificationEnabled}
            user={user}
          />

          {bindableSsoProviders.length > 0 ? (
            <ProfileSsoSection
              identities={ssoIdentities}
              onBind={handleBindSsoProvider}
              providers={bindableSsoProviders}
            />
          ) : null}

          <ProfileAccessSection user={user} />
        </div>
      </div>
      <ProfileImageCropDialogs
        avatarCropImageUrl={profileImages.avatar.cropImageUrl}
        avatarOpen={profileImages.avatar.open}
        avatarUploadError={profileImages.avatar.uploadError}
        avatarUrl={avatarUrl}
        deletingAvatar={deletingAvatar}
        deletingProfileBanner={deletingProfileBanner}
        deletingProfileBackground={deletingProfileBackground}
        maxFileBytes={profileImageMaxBytes}
        onAvatarImageSelect={profileImages.avatar.handleImageSelect}
        onAvatarOpenChange={profileImages.avatar.handleOpenChange}
        onAvatarRemove={profileImages.avatar.handleRemove}
        onAvatarSubmit={profileImages.avatar.handleSubmit}
        onProfileBannerImageSelect={profileImages.profileBanner.handleImageSelect}
        onProfileBannerOpenChange={profileImages.profileBanner.handleOpenChange}
        onProfileBannerRemove={profileImages.profileBanner.handleRemove}
        onProfileBannerSubmit={profileImages.profileBanner.handleSubmit}
        onProfileBackgroundImageSelect={profileImages.profileBackground.handleImageSelect}
        onProfileBackgroundOpenChange={profileImages.profileBackground.handleOpenChange}
        onProfileBackgroundRemove={profileImages.profileBackground.handleRemove}
        onProfileBackgroundSubmit={profileImages.profileBackground.handleSubmit}
        profileBannerCropImageUrl={profileImages.profileBanner.cropImageUrl}
        profileBannerOpen={profileImages.profileBanner.open}
        profileBannerUploadError={profileImages.profileBanner.uploadError}
        profileBannerUrl={profileBannerUrl}
        profileBackgroundCropImageUrl={profileImages.profileBackground.cropImageUrl}
        profileBackgroundOpen={profileImages.profileBackground.open}
        profileBackgroundUploadError={profileImages.profileBackground.uploadError}
        profileBackgroundUrl={profileBackgroundUrl}
        uploadingAvatar={uploadingAvatar}
        uploadingProfileBanner={uploadingProfileBanner}
        uploadingProfileBackground={uploadingProfileBackground}
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

export default Index;
