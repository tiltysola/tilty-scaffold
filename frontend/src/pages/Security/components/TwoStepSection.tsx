import { useState } from 'react';

import {
  FingerprintIcon,
  LinkIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  ShieldIcon,
  ShieldOffIcon,
  Trash2Icon,
} from 'lucide-react';

import { type MfaSettings, type PasskeySummary, type TotpStatus } from '@/lib/auth';
import { Badge } from '@/shadcn/components/ui/badge';
import { Button } from '@/shadcn/components/ui/button';
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
import { Switch } from '@/shadcn/components/ui/switch';

import { ConfirmActionDialog } from '@/components/ConfirmActionDialog';

import { SecuritySection } from './SecuritySection';
import {
  formatPasskeyCount,
  formatPasskeyDeviceType,
  formatPasskeyDisplayName,
  getTwoStepStatusDescription,
} from './utils';

type PendingSwitchConfirmation = 'disable-sso-requirement' | 'disable-two-step' | null;

export function TwoStepSection({
  actionPending,
  mfaSettings,
  onDeletePasskey,
  onDisableTotp,
  onEnableTotp,
  onOpenRecoveryCodes,
  onRegisterPasskey,
  onSsoRequirementChange,
  onTwoStepEnabledChange,
  passkeys,
  totpStatus,
  twoStepSwitchDisabled,
}: {
  actionPending: boolean;
  mfaSettings: MfaSettings;
  onDeletePasskey: (passkeyId: string) => void;
  onDisableTotp: () => void;
  onEnableTotp: () => void;
  onOpenRecoveryCodes: () => void;
  onRegisterPasskey: () => void;
  onSsoRequirementChange: (enabled: boolean) => void;
  onTwoStepEnabledChange: (enabled: boolean) => void;
  passkeys: PasskeySummary[];
  totpStatus: TotpStatus;
  twoStepSwitchDisabled: boolean;
}) {
  const [pendingSwitchConfirmation, setPendingSwitchConfirmation] = useState<PendingSwitchConfirmation>(null);

  const confirmDisableTwoStep = () => {
    setPendingSwitchConfirmation(null);
    onTwoStepEnabledChange(false);
  };

  const confirmDisableSsoRequirement = () => {
    setPendingSwitchConfirmation(null);
    onSsoRequirementChange(false);
  };

  return (
    <SecuritySection
      description="Require a verifier app code or recovery code for sensitive sign-ins."
      title="Two-step Authentication"
    >
      <Item>
        <ItemMedia>
          <ShieldCheckIcon className="size-4" />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>
            Authenticator app
            <Badge variant={totpStatus.enabled ? 'secondary' : 'outline'}>
              {totpStatus.enabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </ItemTitle>
          <ItemDescription>
            {totpStatus.enabled
              ? `${totpStatus.recoveryCodesRemaining} recovery codes remain.`
              : 'No second factor is configured.'}
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          {totpStatus.enabled ? (
            <>
              <Button disabled={actionPending} onClick={onOpenRecoveryCodes} size="sm" type="button" variant="outline">
                <RefreshCwIcon />
                Recovery codes
              </Button>
              <ConfirmActionDialog
                confirmLabel="Disable"
                description="Authenticator app codes and current recovery codes will no longer protect this account."
                onConfirm={onDisableTotp}
                title="Disable authenticator app?"
              >
                <Button disabled={actionPending} size="sm" type="button" variant="destructive">
                  <ShieldOffIcon />
                  Disable
                </Button>
              </ConfirmActionDialog>
            </>
          ) : (
            <Button disabled={actionPending} onClick={onEnableTotp} size="sm" type="button">
              <ShieldIcon />
              Enable
            </Button>
          )}
        </ItemActions>
      </Item>

      <ItemSeparator className="!my-0" />

      <Item>
        <ItemMedia>
          <FingerprintIcon className="size-4" />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>
            Passkeys
            <Badge variant={passkeys.length > 0 ? 'secondary' : 'outline'}>{formatPasskeyCount(passkeys.length)}</Badge>
          </ItemTitle>
          <ItemDescription>Use device-bound or synced passkeys as a phishing-resistant verifier.</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button disabled={actionPending} onClick={onRegisterPasskey} size="sm" type="button">
            <FingerprintIcon />
            Add
          </Button>
        </ItemActions>
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
                    <Button disabled={actionPending} size="sm" type="button" variant="destructive">
                      <Trash2Icon />
                      Remove
                    </Button>
                  </ConfirmActionDialog>
                </div>
              ))}
            </div>
          </ItemFooter>
        ) : null}
      </Item>

      <ItemSeparator className="!my-0" />

      <Item>
        <ItemMedia>
          <ShieldIcon className="size-4" />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>
            Two-step verification
            <Badge variant={mfaSettings.twoStepEnabled ? 'secondary' : 'outline'}>
              {mfaSettings.twoStepEnabled ? 'Enabled' : 'Off'}
            </Badge>
          </ItemTitle>
          <ItemDescription>{getTwoStepStatusDescription(mfaSettings)}</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Switch
            checked={mfaSettings.twoStepEnabled}
            disabled={twoStepSwitchDisabled}
            onCheckedChange={(checked: boolean) => {
              if (!checked) {
                setPendingSwitchConfirmation('disable-two-step');
                return;
              }

              onTwoStepEnabledChange(true);
            }}
          />
        </ItemActions>
      </Item>

      <ItemSeparator className="!my-0" />

      <Item>
        <ItemMedia>
          <LinkIcon className="size-4" />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Third-party sign-in verification</ItemTitle>
          <ItemDescription>Require two-step authentication after SSO provider verification.</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Switch
            checked={mfaSettings.mfaRequiredForSso}
            disabled={actionPending || !mfaSettings.twoStepEnabled}
            onCheckedChange={(checked: boolean) => {
              if (!checked) {
                setPendingSwitchConfirmation('disable-sso-requirement');
                return;
              }

              onSsoRequirementChange(true);
            }}
          />
        </ItemActions>
      </Item>
      <ConfirmActionDialog
        confirmLabel="Disable"
        description="Sensitive sign-ins will no longer require a second factor when password sign-in has already succeeded."
        onConfirm={confirmDisableTwoStep}
        onOpenChange={(open) => (!open ? setPendingSwitchConfirmation(null) : undefined)}
        open={pendingSwitchConfirmation === 'disable-two-step'}
        title="Disable two-step verification?"
      />
      <ConfirmActionDialog
        confirmLabel="Disable"
        description="Third-party sign-ins will be accepted after provider verification without an additional local second factor."
        onConfirm={confirmDisableSsoRequirement}
        onOpenChange={(open) => (!open ? setPendingSwitchConfirmation(null) : undefined)}
        open={pendingSwitchConfirmation === 'disable-sso-requirement'}
        title="Disable SSO two-step requirement?"
      />
    </SecuritySection>
  );
}
