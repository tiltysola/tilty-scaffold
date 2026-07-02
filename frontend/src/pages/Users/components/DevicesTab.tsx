import { useIntl } from 'react-intl';

import { LogOutIcon } from 'lucide-react';

import { type AuthDeviceSession } from '@/lib/auth';
import { Button } from '@/shadcn/components/ui/button';
import { ItemSeparator } from '@/shadcn/components/ui/item';

import { AuthDeviceItem } from '@/components/AuthDeviceItem';
import { ConfirmActionDialog } from '@/components/ConfirmActionDialog';
import { ProfileSection } from '@/components/ProfileCardList';

interface DevicesTabProps {
  devices: AuthDeviceSession[];
  disabled: boolean;
  onRevokeDevice: (sessionId: string) => void;
  onRevokeDevices: () => void;
}

export function DevicesTab({ devices, disabled, onRevokeDevice, onRevokeDevices }: DevicesTabProps) {
  const intl = useIntl();
  const revocableDeviceCount = devices.filter((device) => !device.isCurrent).length;

  return (
    <div className="grid gap-4 pt-2">
      <ProfileSection
        actions={
          revocableDeviceCount > 0 ? (
            <ConfirmActionDialog
              confirmLabel={intl.formatMessage({ id: 'security.sign.out.all.devices' })}
              description={intl.formatMessage({ id: 'users.edit.devices.sign.out.all.description' })}
              onConfirm={onRevokeDevices}
              title={intl.formatMessage({ id: 'users.edit.devices.sign.out.all.title' })}
            >
              <Button disabled={disabled} size="sm" type="button" variant="destructive">
                <LogOutIcon />
                {intl.formatMessage({ id: 'security.sign.out.all.devices' })}
              </Button>
            </ConfirmActionDialog>
          ) : undefined
        }
        description={intl.formatMessage({ id: 'security.login.devices.description' })}
        title={intl.formatMessage({ id: 'security.login.devices' })}
      >
        {devices.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">
            {intl.formatMessage({ id: 'security.login.devices.none' })}
          </div>
        ) : (
          devices.map((device, index) => (
            <div key={device.id}>
              <AuthDeviceItem
                device={device}
                disabled={disabled}
                onRevoke={onRevokeDevice}
                revokeDescription={intl.formatMessage({ id: 'security.device.revoke.description' })}
                revokeLabel={intl.formatMessage({ id: 'security.sign.out.device' })}
                revokeTitle={intl.formatMessage({ id: 'security.device.revoke.title' })}
              />
              {index < devices.length - 1 ? <ItemSeparator className="!my-0" /> : null}
            </div>
          ))
        )}
      </ProfileSection>
    </div>
  );
}
