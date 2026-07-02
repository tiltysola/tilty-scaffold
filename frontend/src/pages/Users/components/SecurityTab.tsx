import { useIntl } from 'react-intl';

import { LinkIcon, ShieldCheckIcon, ShieldIcon, ShieldOffIcon } from 'lucide-react';

import { getTwoStepStatusDescription } from '@/lib/security-display';
import { type ManagedUserSecurity } from '@/lib/users';
import { Badge } from '@/shadcn/components/ui/badge';
import { Button } from '@/shadcn/components/ui/button';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from '@/shadcn/components/ui/item';

import { ConfirmActionDialog } from '@/components/ConfirmActionDialog';
import { ProfileSection } from '@/components/ProfileCardList';

import { MfaSwitchItem } from './MfaSwitchItem';
import { PasskeyItem } from './PasskeyItem';

export type PendingSecurityConfirmation = 'disable-sso-requirement' | 'disable-two-step' | null;

interface SecurityTabProps {
  disabled: boolean;
  onDeletePasskey: (passkeyId: string) => void;
  onDisableTotp: () => void;
  onSsoRequirementChange: (enabled: boolean) => void;
  onTwoStepEnabledChange: (enabled: boolean) => void;
  pendingConfirmation: PendingSecurityConfirmation;
  security: ManagedUserSecurity;
  setPendingConfirmation: (confirmation: PendingSecurityConfirmation) => void;
}

export function SecurityTab({
  disabled,
  onDeletePasskey,
  onDisableTotp,
  onSsoRequirementChange,
  onTwoStepEnabledChange,
  pendingConfirmation,
  security,
  setPendingConfirmation,
}: SecurityTabProps) {
  const intl = useIntl();
  const twoStepSwitchDisabled =
    disabled ||
    (security.mfaSettings.twoStepEnabled
      ? !security.mfaSettings.twoStepCanDisable
      : !security.mfaSettings.twoStepCanEnable);

  return (
    <div className="grid gap-4 pt-2">
      <ProfileSection
        description={intl.formatMessage({ id: 'users.edit.two.step.description' })}
        title={intl.formatMessage({ id: 'security.two.step.authentication' })}
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
