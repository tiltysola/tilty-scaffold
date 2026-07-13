import { type SubmitEventHandler, useCallback, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';

import { FingerprintIcon, KeyRoundIcon, LogOutIcon } from 'lucide-react';
import { toast } from 'sonner';

import { useAsyncAction } from '@/hooks/useAsyncAction';
import { getApiErrorMessage } from '@/lib/api';
import {
  type AuthDeviceSession,
  changePassword,
  completePasskeyRegistration,
  createPasskeyRegistrationOptions,
  createTotpSetup,
  createVerificationChallenge,
  deletePasskey,
  disableTotp,
  enableTotp,
  type MfaSettings,
  type PasskeyRegistrationOptionsResult,
  type PasskeySummary,
  refreshCurrentUser,
  regenerateTotpRecoveryCodes,
  revokeAuthDeviceSession,
  revokeOtherAuthDeviceSessions,
  sendVerificationCode,
  type TotpSetup,
  type TotpStatus,
  updateMfaSettings,
  type VerificationRequired,
  verifyAuthenticationChallenge,
  verifyWithPasskey,
} from '@/lib/auth';
import { Button } from '@/shadcn/components/ui/button';
import { Input } from '@/shadcn/components/ui/input';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from '@/shadcn/components/ui/item';
import { Label } from '@/shadcn/components/ui/label';
import { AuthVerificationPurpose } from '@tilty/shared/auth';
import { changePasswordSchema } from '@tilty/shared/validation';

import { AppDialog } from '@/components/AppDialog';
import { AuthDeviceItem } from '@/components/AuthDeviceItem';
import { ConfirmActionDialog } from '@/components/ConfirmActionDialog';
import FormMessage from '@/components/FormMessage';
import { IdentityVerificationDialog, type IdentityVerificationSubmitInput } from '@/components/IdentityVerification';

import { ChangePasswordDialog, type ChangePasswordFormState } from './components/ChangePasswordDialog';
import { RecoveryCodesDialog } from './components/RecoveryCodesDialog';
import { SecuritySection } from './components/SecuritySection';
import { TotpSetupDialog } from './components/TotpSetupDialog';
import { TwoStepSection } from './components/TwoStepSection';
import {
  defaultMfaSettings,
  defaultTotpStatus,
  fetchSecurityState,
  passkeyRemarkMaxLength,
  type SecurityState,
} from './utils';

type TotpDialogMode = 'regenerate' | 'setup' | null;

interface PendingVerification {
  challenge: VerificationRequired;
  onVerified: () => Promise<boolean | void>;
}

interface PendingPasskeyRegistration {
  placeholderName: string;
  result: PasskeyRegistrationOptionsResult;
}

const emptyChangePasswordForm: ChangePasswordFormState = {
  currentPassword: '',
  password: '',
  confirmPassword: '',
};

const Index = () => {
  const [changePasswordDialogOpen, setChangePasswordDialogOpen] = useState(false);
  const [changePasswordForm, setChangePasswordForm] = useState<ChangePasswordFormState>(emptyChangePasswordForm);
  const [devices, setDevices] = useState<AuthDeviceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [mfaSettings, setMfaSettings] = useState<MfaSettings>(defaultMfaSettings);
  const [passkeys, setPasskeys] = useState<PasskeySummary[]>([]);
  const [passkeyRegistrationRemark, setPasskeyRegistrationRemark] = useState('');
  const [pendingPasskeyRegistration, setPendingPasskeyRegistration] = useState<PendingPasskeyRegistration | null>(null);
  const [pendingVerification, setPendingVerification] = useState<PendingVerification | null>(null);
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [setupCode, setSetupCode] = useState('');
  const [totpStatus, setTotpStatus] = useState<TotpStatus>(defaultTotpStatus);
  const [dialogMode, setDialogMode] = useState<TotpDialogMode>(null);
  const intl = useIntl();
  const action = useAsyncAction();
  const passwordAction = useAsyncAction();

  const applySecurityState = useCallback((nextState: SecurityState) => {
    setTotpStatus(nextState.totpStatus);
    setDevices(nextState.devices);
    setMfaSettings(nextState.mfaSettings);
    setPasskeys(nextState.passkeys);
  }, []);

  const loadSecurityState = useCallback(async () => {
    applySecurityState(await fetchSecurityState());
  }, [applySecurityState]);

  useEffect(() => {
    let isActive = true;

    void fetchSecurityState()
      .then((nextState) => {
        if (isActive) {
          applySecurityState(nextState);
        }
      })
      .catch((error: unknown) => {
        if (isActive) {
          toast.error(getApiErrorMessage(error, intl.formatMessage({ id: 'security.settings.load.failed' })));
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
  }, [applySecurityState, intl]);

  const startVerifiedAction = async (
    purpose: Parameters<typeof createVerificationChallenge>[0],
    onVerified: () => Promise<boolean | void>,
  ) => {
    action.clearError();

    const challenge = await action.run(
      () => createVerificationChallenge(purpose),
      intl.formatMessage({ id: 'identity.security.verification.start.failed' }),
    );

    if (challenge) {
      if ('verified' in challenge) {
        await onVerified();
        return;
      }

      setPendingVerification({
        challenge,
        onVerified,
      });
    }
  };

  const openSetup = async () => {
    await startVerifiedAction(AuthVerificationPurpose.ManageTotp, createTotpSetupAfterVerification);
  };

  const createTotpSetupAfterVerification = async () => {
    action.clearError();
    setRecoveryCodes([]);
    setSetupCode('');

    const nextSetup = await action.run(
      () => createTotpSetup(),
      intl.formatMessage({ id: 'security.totp.setup.create.failed' }),
    );

    if (nextSetup) {
      setSetup(nextSetup);
      setDialogMode('setup');
    }
  };

  const handleEnableTotp: SubmitEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    action.clearError();

    if (!setup) {
      action.setError(intl.formatMessage({ id: 'security.totp.setup.unavailable' }));
      return;
    }

    const result = await action.run(
      () =>
        enableTotp({
          setupToken: setup.setupToken,
          code: setupCode,
        }),
      intl.formatMessage({ id: 'security.totp.enable.failed' }),
    );

    if (result) {
      const { recoveryCodes: nextRecoveryCodes, ...nextTotpStatus } = result;

      setTotpStatus(nextTotpStatus);
      setRecoveryCodes(nextRecoveryCodes);
      setSetup(null);
      setSetupCode('');
      await refreshCurrentUser();
      await loadSecurityState();
      toast.success(intl.formatMessage({ id: 'security.two.step.authentication.enabled' }));
    }
  };

  const disableTotpAfterVerification = async () => {
    const result = await action.run(() => disableTotp(), intl.formatMessage({ id: 'security.totp.disable.failed' }));

    if (result) {
      setTotpStatus(result);
      closeDialog();
      await refreshCurrentUser();
      await loadSecurityState();
      toast.success(intl.formatMessage({ id: 'security.two.step.authentication.disabled' }));
    }
  };

  const handleRegenerateRecoveryCodes = async () => {
    action.clearError();

    const result = await action.run(
      () => regenerateTotpRecoveryCodes(),
      intl.formatMessage({ id: 'security.recovery.codes.regenerate.failed' }),
    );

    if (result) {
      setRecoveryCodes(result.recoveryCodes);
      setTotpStatus((current) => ({
        ...current,
        recoveryCodesRemaining: result.recoveryCodes.length,
      }));
      toast.success(intl.formatMessage({ id: 'security.recovery.codes.regenerated' }));
    }
  };

  const updateMfaSettingsAfterVerification = async (
    input: Parameters<typeof updateMfaSettings>[0],
    fallbackError: string,
  ) => {
    await startVerifiedAction(AuthVerificationPurpose.ManageMfa, async () => {
      try {
        const nextStatus = await updateMfaSettings(input);

        setMfaSettings(nextStatus);
        await refreshCurrentUser();
      } catch (error) {
        toast.error(getApiErrorMessage(error, fallbackError));
      }
    });
  };

  const handleTwoStepEnabledChange = async (checked: boolean) => {
    if (checked && !mfaSettings.twoStepCanEnable) {
      toast.error(intl.formatMessage({ id: 'security.no.verification.method' }));
      return;
    }

    await updateMfaSettingsAfterVerification(
      { enabled: checked },
      intl.formatMessage({ id: 'security.mfa.setting.update.failed' }),
    );
  };

  const handleSsoRequirementChange = async (checked: boolean) => {
    await updateMfaSettingsAfterVerification(
      {
        requiredForSso: checked,
      },
      intl.formatMessage({ id: 'security.sso.mfa.update.failed' }),
    );
  };

  const handleRegisterPasskey = async () => {
    await startVerifiedAction(AuthVerificationPurpose.ManagePasskey, preparePasskeyRegistrationAfterVerification);
  };

  const preparePasskeyRegistrationAfterVerification = async () => {
    const name = `Passkey ${passkeys.length + 1}`;
    const result = await action.run(
      () => createPasskeyRegistrationOptions(),
      intl.formatMessage({ id: 'security.passkey.registration.start.failed' }),
    );

    if (!result) {
      return false;
    }

    setPendingPasskeyRegistration({
      placeholderName: name,
      result,
    });
    setPasskeyRegistrationRemark('');

    return true;
  };

  const handleCompletePasskeyRegistration = async () => {
    if (!pendingPasskeyRegistration) {
      return;
    }

    const normalizedRemark = passkeyRegistrationRemark.trim();
    const name = normalizedRemark ? `Remark: ${normalizedRemark}` : pendingPasskeyRegistration.placeholderName;
    const passkey = await action.run(
      () => completePasskeyRegistration(name, pendingPasskeyRegistration.result),
      intl.formatMessage({ id: 'security.passkey.add.failed' }),
    );

    if (!passkey) {
      return;
    }

    setPendingPasskeyRegistration(null);
    setPasskeyRegistrationRemark('');
    await loadSecurityState();
    await refreshCurrentUser();
    toast.success(intl.formatMessage({ id: 'security.passkey.added' }));
  };

  const handleDeletePasskey = async (passkeyId: string) => {
    await startVerifiedAction(AuthVerificationPurpose.ManagePasskey, async () => {
      const deleted = await action.run(
        () => deletePasskey(passkeyId),
        intl.formatMessage({ id: 'security.passkey.remove.failed' }),
      );

      if (!deleted) {
        return;
      }

      await loadSecurityState();
      await refreshCurrentUser();
      toast.success(intl.formatMessage({ id: 'security.passkey.removed' }));
    });
  };

  const handleSendVerificationCode = async (method: 'email' | 'sms') => {
    if (!pendingVerification) {
      return null;
    }

    return action.run(
      () =>
        sendVerificationCode({
          method,
          verificationToken: pendingVerification.challenge.verificationToken,
        }),
      intl.formatMessage({ id: 'identity.verification.code.send.failed' }),
    );
  };

  const handleConfirmVerification = async (input: IdentityVerificationSubmitInput) => {
    if (!pendingVerification) {
      return;
    }

    const verified =
      input.method === 'passkey'
        ? await action.run(
            () => verifyWithPasskey(pendingVerification.challenge.verificationToken),
            intl.formatMessage({ id: 'identity.passkey.verification.failed' }),
          )
        : await action.run(
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

    const shouldClose = await pendingVerification.onVerified();

    if (shouldClose !== false) {
      setPendingVerification(null);
    }
  };

  const handleRevokeDevice = async (sessionId: string) => {
    const revoked = await action.run(
      () => revokeAuthDeviceSession(sessionId),
      intl.formatMessage({ id: 'security.device.session.revoke.failed' }),
    );

    if (!revoked) {
      return;
    }

    await loadSecurityState();
    toast.success(intl.formatMessage({ id: 'security.session.revoked' }));
  };

  const handleRevokeOtherDevices = async () => {
    const revoked = await action.run(
      () => revokeOtherAuthDeviceSessions(),
      intl.formatMessage({ id: 'security.device.sessions.revoke.failed' }),
    );

    if (!revoked) {
      return;
    }

    await loadSecurityState();
    toast.success(intl.formatMessage({ id: 'security.sessions.revoked' }));
  };

  const handleChangePasswordOpenChange = (open: boolean) => {
    setChangePasswordDialogOpen(open);

    if (!open) {
      setChangePasswordForm(emptyChangePasswordForm);
      passwordAction.clearError();
    }
  };

  const handleOpenChangePassword = async () => {
    if (mfaSettings.availableMethods.length > 0) {
      await startVerifiedAction(AuthVerificationPurpose.ChangePassword, async () =>
        handleChangePasswordOpenChange(true),
      );
      return;
    }

    handleChangePasswordOpenChange(true);
  };

  const handleChangePasswordFieldChange = (field: keyof ChangePasswordFormState, value: string) => {
    passwordAction.clearError();
    setChangePasswordForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleChangePassword = async () => {
    passwordAction.clearError();

    const parsed = changePasswordSchema.safeParse(changePasswordForm);

    if (!parsed.success) {
      passwordAction.setError(
        intl.formatMessage({ id: parsed.error.issues[0]?.message ?? 'validation.password.reset.invalid' }),
      );
      return;
    }

    const result = await passwordAction.run(
      () => changePassword(parsed.data),
      intl.formatMessage({ id: 'security.password.change.failed' }),
    );

    if (result) {
      setChangePasswordDialogOpen(false);
      setChangePasswordForm(emptyChangePasswordForm);
      await loadSecurityState();
      toast.success(intl.formatMessage({ id: 'security.password.changed' }));
    }
  };

  const copyRecoveryCodes = async () => {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join('\n'));
      toast.success(intl.formatMessage({ id: 'security.recovery.codes.copied' }));
    } catch {
      toast.error(intl.formatMessage({ id: 'security.recovery.codes.copy.failed' }));
    }
  };

  const closeDialog = () => {
    setDialogMode(null);
    setRecoveryCodes([]);
    setPasskeyRegistrationRemark('');
    setSetup(null);
    setSetupCode('');
    action.clearError();
  };

  const twoStepSwitchDisabled =
    action.pending || (mfaSettings.twoStepEnabled ? !mfaSettings.twoStepCanDisable : !mfaSettings.twoStepCanEnable);
  const otherDeviceCount = devices.filter((device) => !device.isCurrent).length;

  return (
    <div className="grid gap-6 p-4 lg:p-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-normal">{intl.formatMessage({ id: 'security.title' })}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">{intl.formatMessage({ id: 'security.description' })}</p>
      </div>

      <div className="grid gap-8">
        <TwoStepSection
          actionPending={action.pending}
          mfaSettings={mfaSettings}
          onDeletePasskey={handleDeletePasskey}
          onDisableTotp={() => startVerifiedAction(AuthVerificationPurpose.ManageTotp, disableTotpAfterVerification)}
          onEnableTotp={openSetup}
          onOpenRecoveryCodes={() =>
            startVerifiedAction(AuthVerificationPurpose.ManageTotp, async () => setDialogMode('regenerate'))
          }
          onRegisterPasskey={handleRegisterPasskey}
          onSsoRequirementChange={handleSsoRequirementChange}
          onTwoStepEnabledChange={handleTwoStepEnabledChange}
          passkeys={passkeys}
          totpStatus={totpStatus}
          twoStepSwitchDisabled={twoStepSwitchDisabled}
        />

        <SecuritySection
          description={intl.formatMessage({ id: 'security.password.section.description' })}
          title={intl.formatMessage({ id: 'security.password.section' })}
        >
          <Item>
            <ItemMedia>
              <KeyRoundIcon className="size-4" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{intl.formatMessage({ id: 'security.account.password' })}</ItemTitle>
              <ItemDescription>{intl.formatMessage({ id: 'security.account.password.description' })}</ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button
                disabled={action.pending || passwordAction.pending}
                onClick={handleOpenChangePassword}
                size="sm"
                type="button"
              >
                <KeyRoundIcon />
                {intl.formatMessage({ id: 'common.change' })}
              </Button>
            </ItemActions>
          </Item>
        </SecuritySection>

        <SecuritySection
          actions={
            otherDeviceCount > 0 ? (
              <ConfirmActionDialog
                confirmLabel={intl.formatMessage({ id: 'security.sign.out.devices' })}
                description={intl.formatMessage({ id: 'security.other.devices.sign.out.description' })}
                onConfirm={handleRevokeOtherDevices}
                title={intl.formatMessage({ id: 'security.other.devices.sign.out.title' })}
              >
                <Button disabled={action.pending} type="button" variant="destructive">
                  <LogOutIcon />
                  {intl.formatMessage({ id: 'security.sign.out.other.devices' })}
                </Button>
              </ConfirmActionDialog>
            ) : undefined
          }
          description={intl.formatMessage({ id: 'security.login.devices.description' })}
          title={intl.formatMessage({ id: 'security.login.devices' })}
        >
          {loading ? (
            <div className="p-4 text-sm text-muted-foreground">
              {intl.formatMessage({ id: 'security.login.devices.loading' })}
            </div>
          ) : devices.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">
              {intl.formatMessage({ id: 'security.login.devices.none' })}
            </div>
          ) : (
            devices.map((device, index) => (
              <div key={device.id}>
                <AuthDeviceItem
                  device={device}
                  disabled={action.pending}
                  onRevoke={handleRevokeDevice}
                  revokeDescription={intl.formatMessage({ id: 'security.device.revoke.description' })}
                  revokeLabel={intl.formatMessage({ id: 'profile.sign.out' })}
                  revokeTitle={intl.formatMessage({ id: 'security.device.revoke.title' })}
                />
                {index < devices.length - 1 ? <ItemSeparator className="!my-0" /> : null}
              </div>
            ))
          )}
        </SecuritySection>
      </div>

      {pendingVerification ? (
        <IdentityVerificationDialog
          allowRecoveryCode
          defaultMethod={pendingVerification.challenge.defaultMethod}
          error={action.error}
          methods={pendingVerification.challenge.methods}
          onClearError={action.clearError}
          onOpenChange={(open: boolean) => (!open ? setPendingVerification(null) : undefined)}
          onSendCode={handleSendVerificationCode}
          onSubmit={handleConfirmVerification}
          open={Boolean(pendingVerification)}
          pending={action.pending}
          sendPending={action.pending}
        />
      ) : null}

      <AppDialog
        bodyContentClassName="grid gap-4"
        description={intl.formatMessage({ id: 'security.create.passkey.description' })}
        footer={
          <>
            <Button
              disabled={action.pending}
              onClick={() => {
                setPendingPasskeyRegistration(null);
                setPasskeyRegistrationRemark('');
              }}
              type="button"
              variant="outline"
            >
              {intl.formatMessage({ id: 'common.cancel' })}
            </Button>
            <Button disabled={action.pending} onClick={handleCompletePasskeyRegistration} type="button">
              <FingerprintIcon />
              {intl.formatMessage({
                id: action.pending ? 'security.create.passkey.creating' : 'security.create.passkey',
              })}
            </Button>
          </>
        }
        open={Boolean(pendingPasskeyRegistration)}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setPendingPasskeyRegistration(null);
            setPasskeyRegistrationRemark('');
            action.clearError();
          }
        }}
        title={intl.formatMessage({ id: 'security.create.passkey' })}
      >
        <div className="grid gap-2">
          <Label htmlFor="passkeyRegistrationRemark">{intl.formatMessage({ id: 'security.passkey.remark' })}</Label>
          <Input
            disabled={action.pending}
            id="passkeyRegistrationRemark"
            maxLength={passkeyRemarkMaxLength}
            onChange={(event) => {
              action.clearError();
              setPasskeyRegistrationRemark(event.target.value);
            }}
            placeholder={
              pendingPasskeyRegistration?.placeholderName ??
              intl.formatMessage({ id: 'security.passkey.remark.placeholder' })
            }
            value={passkeyRegistrationRemark}
          />
        </div>
        <FormMessage message={action.error} variant="error" />
      </AppDialog>

      <ChangePasswordDialog
        disabled={passwordAction.pending}
        error={passwordAction.error}
        form={changePasswordForm}
        onFieldChange={handleChangePasswordFieldChange}
        onOpenChange={handleChangePasswordOpenChange}
        onSubmit={() => void handleChangePassword()}
        open={changePasswordDialogOpen}
      />
      <TotpSetupDialog
        code={setupCode}
        error={action.error}
        onCodeChange={setSetupCode}
        onCopyRecoveryCodes={copyRecoveryCodes}
        onOpenChange={(open) => (!open ? closeDialog() : undefined)}
        onSubmit={handleEnableTotp}
        open={dialogMode === 'setup'}
        pending={action.pending}
        recoveryCodes={recoveryCodes}
        setup={setup}
      />
      <RecoveryCodesDialog
        error={action.error}
        onCopy={copyRecoveryCodes}
        onOpenChange={(open) => (!open ? closeDialog() : undefined)}
        onRegenerate={() => void handleRegenerateRecoveryCodes()}
        open={dialogMode === 'regenerate'}
        pending={action.pending}
        recoveryCodes={recoveryCodes}
      />
    </div>
  );
};

export default Index;
