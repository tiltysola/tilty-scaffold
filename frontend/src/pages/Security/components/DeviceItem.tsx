import { LaptopIcon, LogOutIcon, MonitorIcon, SmartphoneIcon, TabletIcon } from 'lucide-react';

import { type AuthDeviceSession } from '@/lib/auth';
import { Badge } from '@/shadcn/components/ui/badge';
import { Button } from '@/shadcn/components/ui/button';
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/shadcn/components/ui/item';

import { ConfirmActionDialog } from '@/components/ConfirmActionDialog';

import { formatSecurityDate } from './utils';

export function DeviceItem({
  device,
  disabled,
  onRevoke,
}: {
  device: AuthDeviceSession;
  disabled: boolean;
  onRevoke: (sessionId: string) => void;
}) {
  return (
    <Item>
      <ItemMedia>
        <DeviceIcon deviceType={device.deviceType} />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>
          {device.deviceName}
          {device.isCurrent ? <Badge variant="secondary">Current</Badge> : null}
        </ItemTitle>
        <ItemDescription>
          {device.browser} · {device.os}
        </ItemDescription>
        <ItemDescription>
          {formatSecurityDate(device.lastActiveAt)} · {device.ipAddress}
        </ItemDescription>
      </ItemContent>
      {!device.isCurrent ? (
        <ItemActions>
          <ConfirmActionDialog
            confirmLabel="Sign out"
            description="This device session will be revoked immediately. The user will need to sign in again on that device."
            onConfirm={() => onRevoke(device.id)}
            title="Sign out this device?"
          >
            <Button disabled={disabled} size="sm" type="button" variant="destructive">
              <LogOutIcon />
              Sign out
            </Button>
          </ConfirmActionDialog>
        </ItemActions>
      ) : null}
    </Item>
  );
}

function DeviceIcon({ deviceType }: { deviceType: AuthDeviceSession['deviceType'] }) {
  if (deviceType === 'mobile') {
    return <SmartphoneIcon className="size-4" />;
  }

  if (deviceType === 'tablet') {
    return <TabletIcon className="size-4" />;
  }

  return (
    <>
      <MonitorIcon className="hidden size-4 sm:block" />
      <LaptopIcon className="size-4 sm:hidden" />
    </>
  );
}
