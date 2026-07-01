import { useState } from 'react';
import { useIntl } from 'react-intl';

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
  const intl = useIntl();

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
      description={intl.formatMessage({ id: 'security.two.step.authentication.description' })}
      title={intl.formatMessage({ id: 'security.two.step.authentication' })}
    >
      <Item>
        <ItemMedia>
          <ShieldCheckIcon className="size-4" />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>
            {intl.formatMessage({ id: 'security.authenticator.app' })}
            <Badge variant={totpStatus.enabled ? 'secondary' : 'outline'}>
              {intl.formatMessage({ id: totpStatus.enabled ? 'common.enabled' : 'common.disabled' })}
            </Badge>
          </ItemTitle>
          <ItemDescription>
            {totpStatus.enabled
              ? intl.formatMessage(
                  { id: 'security.recovery.codes.remaining' },
                  { count: totpStatus.recoveryCodesRemaining },
                )
              : intl.formatMessage({ id: 'security.no.second.factor.configured' })}
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          {totpStatus.enabled ? (
            <>
              <Button disabled={actionPending} onClick={onOpenRecoveryCodes} size="sm" type="button" variant="outline">
                <RefreshCwIcon />
                {intl.formatMessage({ id: 'security.recovery.codes' })}
              </Button>
              <ConfirmActionDialog
                confirmLabel={intl.formatMessage({ id: 'common.disable' })}
                description={intl.formatMessage({ id: 'security.disable.authenticator.description' })}
                onConfirm={onDisableTotp}
                title={intl.formatMessage({ id: 'security.disable.authenticator.title' })}
              >
                <Button disabled={actionPending} size="sm" type="button" variant="destructive">
                  <ShieldOffIcon />
                  {intl.formatMessage({ id: 'common.disable' })}
                </Button>
              </ConfirmActionDialog>
            </>
          ) : (
            <Button disabled={actionPending} onClick={onEnableTotp} size="sm" type="button">
              <ShieldIcon />
              {intl.formatMessage({ id: 'common.enable' })}
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
            {intl.formatMessage({ id: 'security.passkeys' })}
            <Badge variant={passkeys.length > 0 ? 'secondary' : 'outline'}>
              {formatPasskeyCount(passkeys.length, intl)}
            </Badge>
          </ItemTitle>
          <ItemDescription>{intl.formatMessage({ id: 'security.use.passkeys.description' })}</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button disabled={actionPending} onClick={onRegisterPasskey} size="sm" type="button">
            <FingerprintIcon />
            {intl.formatMessage({ id: 'common.add' })}
          </Button>
        </ItemActions>
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
                    <Button disabled={actionPending} size="sm" type="button" variant="destructive">
                      <Trash2Icon />
                      {intl.formatMessage({ id: 'common.remove' })}
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
            {intl.formatMessage({ id: 'security.two.step.verification' })}
            <Badge variant={mfaSettings.twoStepEnabled ? 'secondary' : 'outline'}>
              {intl.formatMessage({ id: mfaSettings.twoStepEnabled ? 'common.enabled' : 'common.disabled' })}
            </Badge>
          </ItemTitle>
          <ItemDescription>{getTwoStepStatusDescription(mfaSettings, intl)}</ItemDescription>
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
          <ItemTitle>{intl.formatMessage({ id: 'security.sso.mfa' })}</ItemTitle>
          <ItemDescription>{intl.formatMessage({ id: 'security.sso.mfa.description' })}</ItemDescription>
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
        confirmLabel={intl.formatMessage({ id: 'common.disable' })}
        description={intl.formatMessage({ id: 'security.disable.totp.description' })}
        onConfirm={confirmDisableTwoStep}
        onOpenChange={(open) => (!open ? setPendingSwitchConfirmation(null) : undefined)}
        open={pendingSwitchConfirmation === 'disable-two-step'}
        title={intl.formatMessage({ id: 'security.disable.totp.title' })}
      />
      <ConfirmActionDialog
        confirmLabel={intl.formatMessage({ id: 'common.disable' })}
        description={intl.formatMessage({ id: 'security.disable.sso.mfa.description' })}
        onConfirm={confirmDisableSsoRequirement}
        onOpenChange={(open) => (!open ? setPendingSwitchConfirmation(null) : undefined)}
        open={pendingSwitchConfirmation === 'disable-sso-requirement'}
        title={intl.formatMessage({ id: 'security.disable.sso.mfa.title' })}
      />
    </SecuritySection>
  );
}
