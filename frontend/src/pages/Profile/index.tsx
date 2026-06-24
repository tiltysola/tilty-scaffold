import { type ChangeEvent, type FormEventHandler, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import {
  BadgeCheckIcon,
  ChevronDownIcon,
  EllipsisVerticalIcon,
  ImageUpIcon,
  KeyRoundIcon,
  LinkIcon,
  MailIcon,
  PencilIcon,
  PhoneIcon,
  SaveIcon,
  ShieldIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { useAsyncAction } from '@/hooks/useAsyncAction';
import { getApiErrorMessage } from '@/lib/api';
import {
  fetchAuthConfig,
  fetchSsoConfig,
  fetchSsoIdentities,
  getSsoBindStartUrl,
  getStoredSession,
  getUserHandle,
  getUserInitials,
  type PhoneCountryCode,
  resolveAssetUrl,
  sendProfileEmailVerification,
  sendProfilePhoneVerification,
  type SsoIdentityPublic,
  type SsoPublicConfig,
  type SsoPublicProvider,
  updateCurrentUser,
  uploadAvatar,
  verifyProfileEmail,
  verifyProfilePhone,
} from '@/lib/auth';
import { displayNameSchema, phoneNumberSchema, verificationCodeSchema } from '@/lib/auth-validation';
import {
  formatPhoneCountryCode,
  getPhoneCountryCode,
  getPhoneLocalNumber,
  getPhonePlaceholder,
  supportedPhoneCountryCodes,
} from '@/lib/phone';
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
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from '@/shadcn/components/ui/item';
import { Label } from '@/shadcn/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shadcn/components/ui/tooltip';

import FormMessage from '@/components/FormMessage';

const Index = () => {
  const initialUser = getStoredSession()?.user ?? null;
  const initialPhoneCountryCode = getPhoneCountryCode(initialUser?.phoneNumber, supportedPhoneCountryCodes);
  const [user, setUser] = useState(initialUser);
  const [displayNameDraft, setDisplayNameDraft] = useState(initialUser?.displayName ?? '');
  const [phoneCountryCodes, setPhoneCountryCodes] = useState<PhoneCountryCode[]>([]);
  const [phoneCountryCodeDraft, setPhoneCountryCodeDraft] = useState<PhoneCountryCode>(
    initialPhoneCountryCode ?? '+86',
  );
  const [phoneLocalNumberDraft, setPhoneLocalNumberDraft] = useState(
    getPhoneLocalNumber(initialUser?.phoneNumber, initialPhoneCountryCode),
  );
  const [phoneVerificationCodeDraft, setPhoneVerificationCodeDraft] = useState('');
  const [phoneVerificationNotice, setPhoneVerificationNotice] = useState<string | null>(null);
  const [profileEmailVerificationEnabled, setProfileEmailVerificationEnabled] = useState(false);
  const [ssoConfig, setSsoConfig] = useState<SsoPublicConfig>({
    enabled: false,
    loginEnabled: false,
    providers: [],
  });
  const [ssoIdentities, setSsoIdentities] = useState<SsoIdentityPublic[]>([]);
  const [editingDisplayName, setEditingDisplayName] = useState(false);
  const [editingPhoneNumber, setEditingPhoneNumber] = useState(false);
  const [verifyingEmail, setVerifyingEmail] = useState(false);
  const [emailVerificationCodeDraft, setEmailVerificationCodeDraft] = useState('');
  const [emailVerificationNotice, setEmailVerificationNotice] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const profileAction = useAsyncAction();
  const emailVerificationSendAction = useAsyncAction();
  const emailVerificationConfirmAction = useAsyncAction();
  const phoneVerificationSendAction = useAsyncAction();
  const phoneVerificationConfirmAction = useAsyncAction();
  const avatarUrl = resolveAssetUrl(user?.avatarUrl);
  const fallback = getUserInitials(user?.displayName);
  const userHandle = getUserHandle(user?.username);
  const savingProfile = profileAction.pending;
  const sendingEmailVerification = emailVerificationSendAction.pending;
  const confirmingEmailVerification = emailVerificationConfirmAction.pending;
  const sendingPhoneVerification = phoneVerificationSendAction.pending;
  const confirmingPhoneVerification = phoneVerificationConfirmAction.pending;
  const phoneVerificationPending = sendingPhoneVerification || confirmingPhoneVerification;
  const displayNameChanged = displayNameDraft.trim() !== (user?.displayName ?? '');
  const phoneNumberDraft = useMemo(
    () => `${phoneCountryCodeDraft}${phoneLocalNumberDraft.trim()}`,
    [phoneCountryCodeDraft, phoneLocalNumberDraft],
  );
  const emailNeedsVerification = Boolean(user?.email && !user.emailVerified);
  const emailVerificationAvailable = emailNeedsVerification && profileEmailVerificationEnabled;
  const phoneBindingEnabled = phoneCountryCodes.length > 0;
  const phoneNumberChanged = phoneBindingEnabled && phoneNumberDraft !== (user?.phoneNumber ?? '');
  const phoneVerificationRequired = phoneBindingEnabled && (phoneNumberChanged || !user?.phoneVerified);
  const bindableSsoProviders = ssoConfig.enabled
    ? ssoConfig.providers.filter((provider) => provider.bindingEnabled)
    : [];

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
        toast.error(getApiErrorMessage(error, 'SSO identities could not be refreshed.'));
      });
  }, [location.hash, location.pathname, navigate]);

  useEffect(() => {
    let active = true;

    void fetchAuthConfig()
      .then((config) => {
        if (!active) {
          return;
        }

        setPhoneCountryCodes(config.phoneCountryCodes);
        setProfileEmailVerificationEnabled(config.profileEmailVerificationEnabled);
        const currentCountryCode = getPhoneCountryCode(
          user?.phoneNumber,
          config.phoneCountryCodes.length ? config.phoneCountryCodes : supportedPhoneCountryCodes,
        );
        setPhoneCountryCodeDraft(currentCountryCode ?? config.phoneCountryCodes[0] ?? '+86');
        setPhoneLocalNumberDraft(getPhoneLocalNumber(user?.phoneNumber, currentCountryCode));
      })
      .catch((error: unknown) => {
        if (active) {
          toast.error(getApiErrorMessage(error, 'Profile configuration could not be loaded.'));
        }
      });

    return () => {
      active = false;
    };
  }, [user?.phoneNumber]);

  useEffect(() => {
    let active = true;

    void Promise.all([fetchSsoConfig(), fetchSsoIdentities()])
      .then(([config, identityResult]) => {
        if (!active) {
          return;
        }

        setSsoConfig(config);
        setSsoIdentities(identityResult.identities);
      })
      .catch((error: unknown) => {
        if (active) {
          toast.error(getApiErrorMessage(error, 'SSO configuration could not be loaded.'));
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const handleAvatarSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];

    event.currentTarget.value = '';

    if (!file) {
      return;
    }

    setUploadingAvatar(true);

    try {
      const updatedUser = await uploadAvatar(file);

      setUser(updatedUser);
      setDisplayNameDraft(updatedUser.displayName);
      syncPhoneDraft(updatedUser.phoneNumber, phoneCountryCodes, setPhoneCountryCodeDraft, setPhoneLocalNumberDraft);
      toast.success('Avatar updated.');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Avatar could not be uploaded.'));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleProfileSubmit: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    profileAction.clearError();

    const parsed = displayNameSchema.safeParse(displayNameDraft);

    if (!parsed.success) {
      profileAction.setError(parsed.error.issues[0]?.message ?? 'Display name is invalid.');
      return;
    }

    const updatedUser = await profileAction.run(
      () =>
        updateCurrentUser({
          displayName: parsed.data,
        }),
      'Profile could not be updated.',
    );

    if (updatedUser) {
      setUser(updatedUser);
      setDisplayNameDraft(updatedUser.displayName);
      syncPhoneDraft(updatedUser.phoneNumber, phoneCountryCodes, setPhoneCountryCodeDraft, setPhoneLocalNumberDraft);
      setEditingDisplayName(false);
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
      const expiresInMinutes = Math.ceil(result.expiresInSeconds / 60);

      setEmailVerificationNotice(`Verification code sent. It expires in ${expiresInMinutes} minutes.`);
    }

    return result;
  };

  const handleStartEmailVerification = () => {
    if (!emailVerificationAvailable) {
      return;
    }

    setEmailVerificationCodeDraft('');
    setEmailVerificationNotice(null);
    emailVerificationSendAction.clearError();
    emailVerificationConfirmAction.clearError();
    setVerifyingEmail(true);
    void requestProfileEmailVerificationCode();
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

  const handleEmailVerificationSubmit: FormEventHandler<HTMLFormElement> = async (event) => {
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
      setUser(updatedUser);
      setDisplayNameDraft(updatedUser.displayName);
      syncPhoneDraft(updatedUser.phoneNumber, phoneCountryCodes, setPhoneCountryCodeDraft, setPhoneLocalNumberDraft);
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

  const requestProfilePhoneVerificationCode = async () => {
    setPhoneVerificationNotice(null);
    phoneVerificationSendAction.clearError();
    phoneVerificationConfirmAction.clearError();

    const parsed = parsePhoneNumberDraft();

    if (!parsed.phoneNumber) {
      phoneVerificationSendAction.setError(parsed.error ?? 'Phone number is invalid.');
      return;
    }

    const result = await phoneVerificationSendAction.run(
      () =>
        sendProfilePhoneVerification({
          phoneNumber: parsed.phoneNumber,
        }),
      'Verification code could not be sent.',
    );

    if (result) {
      const expiresInMinutes = Math.ceil(result.expiresInSeconds / 60);

      setPhoneVerificationNotice(`Verification code sent. It expires in ${expiresInMinutes} minutes.`);
    }
  };

  const handlePhoneNumberSubmit: FormEventHandler<HTMLFormElement> = async (event) => {
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

    const updatedUser = await phoneVerificationConfirmAction.run(
      () =>
        verifyProfilePhone({
          phoneNumber: parsed.phoneNumber,
          phoneVerificationCode: parsedCode.data,
        }),
      'Phone number could not be verified.',
    );

    if (updatedUser) {
      setUser(updatedUser);
      setDisplayNameDraft(updatedUser.displayName);
      syncPhoneDraft(updatedUser.phoneNumber, phoneCountryCodes, setPhoneCountryCodeDraft, setPhoneLocalNumberDraft);
      setPhoneVerificationCodeDraft('');
      setPhoneVerificationNotice(null);
      setEditingPhoneNumber(false);
      toast.success('Phone number verified.');
    }
  };

  const handleEditDisplayName = () => {
    setDisplayNameDraft(user?.displayName ?? '');
    profileAction.clearError();
    setEditingDisplayName(true);
  };

  const handleEditPhoneNumber = () => {
    syncPhoneDraft(user?.phoneNumber, phoneCountryCodes, setPhoneCountryCodeDraft, setPhoneLocalNumberDraft);
    setPhoneVerificationCodeDraft('');
    setPhoneVerificationNotice(null);
    phoneVerificationSendAction.clearError();
    phoneVerificationConfirmAction.clearError();
    setEditingPhoneNumber(true);
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
    window.location.assign(getSsoBindStartUrl(providerId, '/profile'));
  };

  return (
    <div className="grid min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">
      <ItemGroup className="mx-auto w-full max-w-[800px] self-start gap-0! overflow-hidden rounded-lg border bg-card has-data-[size=sm]:gap-0! has-data-[size=xs]:gap-0!">
        <Item className="rounded-none px-4 py-4">
          <input
            ref={fileInputRef}
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={handleAvatarSelect}
            type="file"
          />
          <ItemMedia className="size-12 rounded-lg" variant="image">
            <Avatar className="h-full w-full rounded-lg after:hidden">
              {avatarUrl ? (
                <AvatarImage className="rounded-lg" src={avatarUrl} alt={user?.displayName ?? 'Unknown User'} />
              ) : null}
              <AvatarFallback className="rounded-lg">{fallback}</AvatarFallback>
            </Avatar>
          </ItemMedia>
          <ItemContent className="gap-0 text-sm leading-tight">
            <ItemTitle>{user?.displayName ?? 'Unknown User'}</ItemTitle>
            <ItemDescription className="text-xs">{userHandle}</ItemDescription>
          </ItemContent>
          <ItemActions>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon-sm" type="button" variant="ghost">
                  <EllipsisVerticalIcon />
                  <span className="sr-only">Open profile actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-44">
                <DropdownMenuItem
                  disabled={uploadingAvatar}
                  onSelect={(event: Event) => {
                    event.preventDefault();
                    fileInputRef.current?.click();
                  }}
                >
                  <ImageUpIcon />
                  {uploadingAvatar ? 'Uploading' : 'Change avatar'}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={handleEditDisplayName}>
                  <PencilIcon />
                  Edit display name
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </ItemActions>
        </Item>

        <ItemSeparator className="!my-0" />

        <ProfileItem
          actionDisabled={!emailVerificationAvailable}
          actionIcon={<MailIcon />}
          actionLabel={emailNeedsVerification ? 'Verify' : undefined}
          actionTooltip={
            emailNeedsVerification && !profileEmailVerificationEnabled
              ? 'Email verification is unavailable because SMTP email is not configured.'
              : undefined
          }
          description={user?.email ?? 'Not available'}
          icon={<MailIcon className="size-4" />}
          onAction={emailNeedsVerification ? handleStartEmailVerification : undefined}
          status={user?.emailVerified ? 'Verified' : 'Unverified'}
          statusVariant={user?.emailVerified ? 'secondary' : 'outline'}
          title="Email"
        />

        <ItemSeparator className="!my-0" />

        <ProfileItem
          actionLabel={user?.phoneNumber ? 'Change' : 'Bind'}
          actionDisabled={!phoneBindingEnabled}
          actionIcon={<PhoneIcon />}
          actionTooltip={
            phoneBindingEnabled ? undefined : 'Phone binding is unavailable because SMS verification is not configured.'
          }
          description={user?.phoneNumber ?? 'Not bound'}
          icon={<PhoneIcon className="size-4" />}
          onAction={handleEditPhoneNumber}
          status={user?.phoneNumber ? (user.phoneVerified ? 'Verified' : 'Unverified') : undefined}
          statusVariant={user?.phoneVerified ? 'secondary' : 'outline'}
          title="Phone"
        />

        {bindableSsoProviders.length > 0 ? (
          <>
            <ItemSeparator className="!my-0" />
            <SsoProvidersItem
              identities={ssoIdentities}
              onBind={handleBindSsoProvider}
              providers={bindableSsoProviders}
            />
          </>
        ) : null}

        <ItemSeparator className="!my-0" />

        <ProfileItem
          description={formatRoleAccessSummary(user?.roles, user?.permissions)}
          icon={<ShieldIcon className="size-4" />}
          title="Roles"
        />
      </ItemGroup>
      <Dialog open={editingDisplayName} onOpenChange={setEditingDisplayName}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit display name</DialogTitle>
            <DialogDescription>Update the display name shown across the application.</DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={handleProfileSubmit}>
            <div className="grid gap-2">
              <Label htmlFor="displayName">Display name</Label>
              <Input
                autoComplete="name"
                disabled={savingProfile}
                id="displayName"
                name="displayName"
                onChange={(event) => setDisplayNameDraft(event.target.value)}
                value={displayNameDraft}
              />
            </div>
            <FormMessage message={profileAction.error} variant="error" />
            <DialogFooter>
              <DialogClose asChild>
                <Button disabled={savingProfile} type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button disabled={savingProfile || !displayNameChanged} type="submit">
                <SaveIcon />
                {savingProfile ? 'Saving' : 'Save changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={verifyingEmail} onOpenChange={handleEmailVerificationOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verify email</DialogTitle>
            <DialogDescription>
              Enter the verification code sent to {user?.email ?? 'your email address'}.
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={handleEmailVerificationSubmit}>
            <div className="grid gap-2">
              <Label htmlFor="emailVerificationCode">Verification code</Label>
              <div className="flex gap-2">
                <Input
                  autoComplete="one-time-code"
                  disabled={confirmingEmailVerification}
                  id="emailVerificationCode"
                  inputMode="numeric"
                  maxLength={6}
                  name="emailVerificationCode"
                  onChange={(event) => setEmailVerificationCodeDraft(event.target.value)}
                  value={emailVerificationCodeDraft}
                />
                <Button
                  className="shrink-0"
                  disabled={sendingEmailVerification || confirmingEmailVerification}
                  onClick={requestProfileEmailVerificationCode}
                  type="button"
                  variant="outline"
                >
                  <MailIcon />
                  {sendingEmailVerification ? 'Sending' : 'Send code'}
                </Button>
              </div>
            </div>
            <FormMessage message={emailVerificationNotice} variant="notice" />
            <FormMessage
              message={emailVerificationSendAction.error ?? emailVerificationConfirmAction.error}
              variant="error"
            />
            <DialogFooter>
              <DialogClose asChild>
                <Button
                  disabled={sendingEmailVerification || confirmingEmailVerification}
                  type="button"
                  variant="outline"
                >
                  Cancel
                </Button>
              </DialogClose>
              <Button disabled={sendingEmailVerification || confirmingEmailVerification} type="submit">
                <SaveIcon />
                {confirmingEmailVerification ? 'Verifying' : 'Verify email'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={editingPhoneNumber} onOpenChange={handlePhoneNumberOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{user?.phoneNumber ? 'Change phone' : 'Bind phone'}</DialogTitle>
            <DialogDescription>Verify the phone number associated with this account.</DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={handlePhoneNumberSubmit}>
            <div className="grid gap-2">
              <Label htmlFor="phoneLocalNumber">Phone number</Label>
              <div className="flex gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild disabled={phoneVerificationPending || !phoneBindingEnabled}>
                    <Button
                      className="w-24 shrink-0 justify-between"
                      id="phoneCountryCode"
                      type="button"
                      variant="outline"
                    >
                      {phoneCountryCodeDraft}
                      <ChevronDownIcon />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="z-[60] min-w-56">
                    {phoneCountryCodes.map((countryCode) => (
                      <DropdownMenuItem key={countryCode} onSelect={() => setPhoneCountryCodeDraft(countryCode)}>
                        {formatPhoneCountryCode(countryCode)}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Input
                  autoComplete="tel-national"
                  disabled={phoneVerificationPending || !phoneBindingEnabled}
                  id="phoneLocalNumber"
                  name="phoneLocalNumber"
                  onChange={(event) => setPhoneLocalNumberDraft(event.target.value)}
                  placeholder={getPhonePlaceholder(phoneCountryCodeDraft)}
                  value={phoneLocalNumberDraft}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phoneVerificationCode">Verification code</Label>
              <div className="flex gap-2">
                <Input
                  autoComplete="one-time-code"
                  disabled={phoneVerificationPending || !phoneBindingEnabled}
                  id="phoneVerificationCode"
                  inputMode="numeric"
                  maxLength={6}
                  name="phoneVerificationCode"
                  onChange={(event) => setPhoneVerificationCodeDraft(event.target.value)}
                  value={phoneVerificationCodeDraft}
                />
                <Button
                  className="shrink-0"
                  disabled={phoneVerificationPending || !phoneBindingEnabled}
                  onClick={requestProfilePhoneVerificationCode}
                  type="button"
                  variant="outline"
                >
                  <PhoneIcon />
                  {sendingPhoneVerification ? 'Sending' : 'Send code'}
                </Button>
              </div>
            </div>
            <FormMessage message={phoneVerificationNotice} variant="notice" />
            <FormMessage
              message={phoneVerificationSendAction.error ?? phoneVerificationConfirmAction.error}
              variant="error"
            />
            <DialogFooter>
              <DialogClose asChild>
                <Button disabled={phoneVerificationPending} type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button
                disabled={
                  phoneVerificationPending ||
                  !phoneVerificationRequired ||
                  phoneVerificationCodeDraft.trim().length === 0
                }
                type="submit"
              >
                <SaveIcon />
                {confirmingPhoneVerification ? 'Verifying' : 'Verify phone'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

function ProfileItem({
  actionDisabled,
  actionIcon,
  actionLabel,
  actionTooltip,
  description,
  icon,
  onAction,
  status,
  statusVariant,
  title,
}: {
  actionDisabled?: boolean;
  actionIcon?: ReactNode;
  actionLabel?: string;
  actionTooltip?: string;
  description: ReactNode;
  icon: ReactNode;
  onAction?: () => void;
  status?: string;
  statusVariant?: 'destructive' | 'outline' | 'secondary';
  title: string;
}) {
  return (
    <Item className="rounded-none px-4 py-4">
      <ItemContent>
        <ItemTitle className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">{icon}</span>
          {title}
          {status ? <Badge variant={statusVariant}>{status}</Badge> : null}
        </ItemTitle>
        <ItemDescription className="break-words">{description}</ItemDescription>
      </ItemContent>
      {onAction && actionLabel ? (
        <ItemActions>
          <ActionButton
            disabled={actionDisabled}
            icon={actionIcon}
            label={actionLabel}
            onClick={onAction}
            tooltip={actionTooltip}
          />
        </ItemActions>
      ) : null}
    </Item>
  );
}

function ActionButton({
  disabled,
  icon,
  label,
  onClick,
  tooltip,
}: {
  disabled?: boolean;
  icon?: ReactNode;
  label: string;
  onClick: () => void;
  tooltip?: string;
}) {
  const button = (
    <Button disabled={disabled} onClick={onClick} size="sm" type="button" variant="outline">
      {icon}
      {label}
    </Button>
  );

  if (!tooltip) {
    return button;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex" tabIndex={0}>
          {button}
        </span>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function SsoProvidersItem({
  identities,
  onBind,
  providers,
}: {
  identities: SsoIdentityPublic[];
  onBind: (providerId: string) => void;
  providers: SsoPublicProvider[];
}) {
  return (
    <Item className="rounded-none px-4 py-4">
      <ItemContent className="gap-3">
        <ItemTitle className="flex items-center gap-2">
          <KeyRoundIcon className="size-4 text-muted-foreground" />
          SSO providers
        </ItemTitle>
        <div className="grid gap-2">
          {providers.map((provider) => {
            const identity = identities.find((candidate) => candidate.providerId === provider.id);

            return (
              <div className="flex min-w-0 items-center justify-between gap-3" key={provider.id}>
                <div className="flex min-w-0 items-center gap-3">
                  <SsoProviderIcon iconUrl={provider.iconUrl} name={provider.name} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{provider.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {identity
                        ? `Bound as ${identity.email}`
                        : provider.protocol === 'oidc'
                          ? 'OpenID Connect'
                          : 'OAuth 2.0'}
                    </div>
                  </div>
                </div>
                <Button
                  disabled={Boolean(identity)}
                  onClick={() => onBind(provider.id)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <LinkIcon />
                  {identity ? 'Bound' : 'Bind'}
                </Button>
              </div>
            );
          })}
        </div>
      </ItemContent>
    </Item>
  );
}

function SsoProviderIcon({ iconUrl, name }: { iconUrl?: string; name: string }) {
  return iconUrl ? (
    <img alt="" className="size-7 rounded-md border object-contain p-1" referrerPolicy="no-referrer" src={iconUrl} />
  ) : (
    <div className="flex size-7 items-center justify-center rounded-md border text-muted-foreground">
      <BadgeCheckIcon aria-label={name} className="size-4" />
    </div>
  );
}

function formatRoleAccessSummary(roles: string[] | undefined, permissions: string[] | undefined) {
  const roleList = roles?.length ? roles.join(', ') : 'No roles';

  return permissions?.length ? `${roleList} (${permissions.join(', ')})` : roleList;
}

function getHashParams(hash: string) {
  return new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
}

function syncPhoneDraft(
  phoneNumber: string | undefined,
  phoneCountryCodes: PhoneCountryCode[],
  setPhoneCountryCode: (countryCode: PhoneCountryCode) => void,
  setPhoneLocalNumber: (phoneNumber: string) => void,
) {
  const countryCode =
    getPhoneCountryCode(phoneNumber, phoneCountryCodes.length ? phoneCountryCodes : supportedPhoneCountryCodes) ??
    phoneCountryCodes[0] ??
    '+86';

  setPhoneCountryCode(countryCode);
  setPhoneLocalNumber(getPhoneLocalNumber(phoneNumber, countryCode));
}

export default Index;
