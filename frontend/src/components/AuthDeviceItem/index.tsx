import { useIntl } from 'react-intl';

import { LogOutIcon } from 'lucide-react';

import { type AuthDeviceSession } from '@/lib/auth';
import { formatSecurityDate } from '@/lib/security-display';
import { Badge } from '@/shadcn/components/ui/badge';
import { Button } from '@/shadcn/components/ui/button';
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/shadcn/components/ui/item';

import { ConfirmActionDialog } from '@/components/ConfirmActionDialog';

import { DeviceIcon } from './DeviceIcon';

interface AuthDeviceItemProps {
  device: AuthDeviceSession;
  disabled: boolean;
  onRevoke: (sessionId: string) => void;
  revokeDescription: string;
  revokeLabel: string;
  revokeTitle: string;
}

export function AuthDeviceItem({
  device,
  disabled,
  onRevoke,
  revokeDescription,
  revokeLabel,
  revokeTitle,
}: AuthDeviceItemProps) {
  const intl = useIntl();

  return (
    <Item>
      <ItemMedia>
        <DeviceIcon deviceType={device.deviceType} />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>
          {device.deviceName}
          {device.isCurrent ? <Badge variant="secondary">{intl.formatMessage({ id: 'common.current' })}</Badge> : null}
        </ItemTitle>
        <ItemDescription>
          {device.browser} · {device.os}
        </ItemDescription>
        <ItemDescription>
          {formatSecurityDate(device.lastActiveAt, intl)} · {device.ipAddress}
        </ItemDescription>
      </ItemContent>
      {!device.isCurrent ? (
        <ItemActions>
          <ConfirmActionDialog
            confirmLabel={revokeLabel}
            description={revokeDescription}
            onConfirm={() => onRevoke(device.id)}
            title={revokeTitle}
          >
            <Button disabled={disabled} size="sm" type="button" variant="destructive">
              <LogOutIcon />
              {revokeLabel}
            </Button>
          </ConfirmActionDialog>
        </ItemActions>
      ) : null}
    </Item>
  );
}
