import { type SubmitEventHandler, useCallback, useEffect, useState } from 'react';

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
import { changePasswordSchema } from '@/lib/auth-validation';
import { Button } from '@/shadcn/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shadcn/components/ui/dialog';
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

import { ConfirmActionDialog } from '@/components/ConfirmActionDialog';
import FormMessage from '@/components/FormMessage';
import { IdentityVerificationDialog, type IdentityVerificationSubmitInput } from '@/components/IdentityVerification';

import { ChangePasswordDialog, type ChangePasswordFormState } from './components/ChangePasswordDialog';
import { DeviceItem } from './components/DeviceItem';
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
          toast.error(getApiErrorMessage(error, 'Security settings could not be loaded.'));
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
  }, [applySecurityState]);

  const startVerifiedAction = async (
    purpose: Parameters<typeof createVerificationChallenge>[0],
    onVerified: () => Promise<boolean | void>,
  ) => {
    action.clearError();

    const challenge = await action.run(
      () => createVerificationChallenge(purpose),
      'Security verification could not be started.',
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
    await startVerifiedAction('manage_totp', createTotpSetupAfterVerification);
  };

  const createTotpSetupAfterVerification = async () => {
    action.clearError();
    setRecoveryCodes([]);
    setSetupCode('');

    const nextSetup = await action.run(() => createTotpSetup(), 'Two-step setup could not be created.');

    if (nextSetup) {
      setSetup(nextSetup);
      setDialogMode('setup');
    }
  };

  const handleEnableTotp: SubmitEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    action.clearError();

    if (!setup) {
      action.setError('Two-step setup is not available.');
      return;
    }

    const result = await action.run(
      () =>
        enableTotp({
          setupToken: setup.setupToken,
          code: setupCode,
        }),
      'Two-step authentication could not be enabled.',
    );

    if (result) {
      const { recoveryCodes: nextRecoveryCodes, ...nextTotpStatus } = result;

      setTotpStatus(nextTotpStatus);
      setRecoveryCodes(nextRecoveryCodes);
      setSetup(null);
      setSetupCode('');
      await refreshCurrentUser();
      await loadSecurityState();
      toast.success('Two-step authentication enabled.');
    }
  };

  const disableTotpAfterVerification = async () => {
    const result = await action.run(() => disableTotp(), 'Two-step authentication could not be disabled.');

    if (result) {
      setTotpStatus(result);
      closeDialog();
      await refreshCurrentUser();
      await loadSecurityState();
      toast.success('Two-step authentication disabled.');
    }
  };

  const handleRegenerateRecoveryCodes = async () => {
    action.clearError();

    const result = await action.run(() => regenerateTotpRecoveryCodes(), 'Recovery codes could not be regenerated.');

    if (result) {
      setRecoveryCodes(result.recoveryCodes);
      setTotpStatus((current) => ({
        ...current,
        recoveryCodesRemaining: result.recoveryCodes.length,
      }));
      toast.success('Recovery codes regenerated.');
    }
  };

  const updateMfaSettingsAfterVerification = async (
    input: Parameters<typeof updateMfaSettings>[0],
    fallbackError: string,
  ) => {
    await startVerifiedAction('manage_mfa', async () => {
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
      toast.error('No two-step verification method is available.');
      return;
    }

    await updateMfaSettingsAfterVerification(
      { enabled: checked },
      'Two-step authentication setting could not be updated.',
    );
  };

  const handleSsoRequirementChange = async (checked: boolean) => {
    await updateMfaSettingsAfterVerification(
      {
        requiredForSso: checked,
      },
      'SSO two-step setting could not be updated.',
    );
  };

  const handleRegisterPasskey = async () => {
    await startVerifiedAction('manage_passkey', preparePasskeyRegistrationAfterVerification);
  };

  const preparePasskeyRegistrationAfterVerification = async () => {
    const name = `Passkey ${passkeys.length + 1}`;
    const result = await action.run(
      () => createPasskeyRegistrationOptions(),
      'Passkey registration could not be started.',
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
      'Passkey could not be added.',
    );

    if (!passkey) {
      return;
    }

    setPendingPasskeyRegistration(null);
    setPasskeyRegistrationRemark('');
    await loadSecurityState();
    await refreshCurrentUser();
    toast.success('Passkey added.');
  };

  const handleDeletePasskey = async (passkeyId: string) => {
    await startVerifiedAction('manage_passkey', async () => {
      const deleted = await action.run(() => deletePasskey(passkeyId), 'Passkey could not be removed.');

      if (!deleted) {
        return;
      }

      await loadSecurityState();
      await refreshCurrentUser();
      toast.success('Passkey removed.');
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
      'Verification code could not be sent.',
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
            'Passkey verification could not be completed.',
          )
        : await action.run(
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

    const shouldClose = await pendingVerification.onVerified();

    if (shouldClose !== false) {
      setPendingVerification(null);
    }
  };

  const handleRevokeDevice = async (sessionId: string) => {
    const revoked = await action.run(() => revokeAuthDeviceSession(sessionId), 'Device session could not be revoked.');

    if (!revoked) {
      return;
    }

    await loadSecurityState();
    toast.success('Device session revoked.');
  };

  const handleRevokeOtherDevices = async () => {
    const revoked = await action.run(() => revokeOtherAuthDeviceSessions(), 'Device sessions could not be revoked.');

    if (!revoked) {
      return;
    }

    await loadSecurityState();
    toast.success('Other device sessions revoked.');
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
      await startVerifiedAction('change_password', async () => handleChangePasswordOpenChange(true));
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
      passwordAction.setError(parsed.error.issues[0]?.message ?? 'Password change details are invalid.');
      return;
    }

    const result = await passwordAction.run(() => changePassword(parsed.data), 'Password could not be changed.');

    if (result) {
      setChangePasswordDialogOpen(false);
      setChangePasswordForm(emptyChangePasswordForm);
      await loadSecurityState();
      toast.success('Password changed. Other devices have been signed out.');
    }
  };

  const copyRecoveryCodes = async () => {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join('\n'));
      toast.success('Recovery codes copied.');
    } catch {
      toast.error('Recovery codes could not be copied.');
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
        <h1 className="text-2xl font-semibold tracking-normal">Security</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Password, two-step authentication, and active device sessions.
        </p>
      </div>

      <div className="grid gap-8">
        <TwoStepSection
          actionPending={action.pending}
          mfaSettings={mfaSettings}
          onDeletePasskey={handleDeletePasskey}
          onDisableTotp={() => startVerifiedAction('manage_totp', disableTotpAfterVerification)}
          onEnableTotp={openSetup}
          onOpenRecoveryCodes={() => startVerifiedAction('manage_totp', async () => setDialogMode('regenerate'))}
          onRegisterPasskey={handleRegisterPasskey}
          onSsoRequirementChange={handleSsoRequirementChange}
          onTwoStepEnabledChange={handleTwoStepEnabledChange}
          passkeys={passkeys}
          totpStatus={totpStatus}
          twoStepSwitchDisabled={twoStepSwitchDisabled}
        />

        <SecuritySection description="Update the local password for this account." title="Password">
          <Item>
            <ItemMedia>
              <KeyRoundIcon className="size-4" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>Account password</ItemTitle>
              <ItemDescription>Change the password used for email or username sign-in.</ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button
                disabled={action.pending || passwordAction.pending}
                onClick={handleOpenChangePassword}
                size="sm"
                type="button"
              >
                <KeyRoundIcon />
                Change
              </Button>
            </ItemActions>
          </Item>
        </SecuritySection>

        <SecuritySection
          actions={
            otherDeviceCount > 0 ? (
              <ConfirmActionDialog
                confirmLabel="Sign out devices"
                description="All other active sessions will be revoked immediately. Those devices will need to sign in again."
                onConfirm={handleRevokeOtherDevices}
                title="Sign out other devices?"
              >
                <Button disabled={action.pending} type="button" variant="destructive">
                  <LogOutIcon />
                  Sign out other devices
                </Button>
              </ConfirmActionDialog>
            ) : undefined
          }
          description="Review browsers and devices with active sessions."
          title="Login Devices"
        >
          {loading ? (
            <div className="p-4 text-sm text-muted-foreground">Loading devices.</div>
          ) : devices.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No active devices.</div>
          ) : (
            devices.map((device, index) => (
              <div key={device.id}>
                <DeviceItem device={device} disabled={action.pending} onRevoke={handleRevokeDevice} />
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

      <Dialog
        open={Boolean(pendingPasskeyRegistration)}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setPendingPasskeyRegistration(null);
            setPasskeyRegistrationRemark('');
            action.clearError();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create passkey</DialogTitle>
            <DialogDescription>Continue with your device or password manager to create a passkey.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="passkeyRegistrationRemark">Remark</Label>
            <Input
              disabled={action.pending}
              id="passkeyRegistrationRemark"
              maxLength={passkeyRemarkMaxLength}
              onChange={(event) => {
                action.clearError();
                setPasskeyRegistrationRemark(event.target.value);
              }}
              placeholder={pendingPasskeyRegistration?.placeholderName ?? 'Passkey'}
              value={passkeyRegistrationRemark}
            />
          </div>
          <FormMessage message={action.error} variant="error" />
          <DialogFooter>
            <Button
              disabled={action.pending}
              onClick={() => {
                setPendingPasskeyRegistration(null);
                setPasskeyRegistrationRemark('');
              }}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={action.pending} onClick={handleCompletePasskeyRegistration} type="button">
              <FingerprintIcon />
              {action.pending ? 'Creating' : 'Create passkey'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
