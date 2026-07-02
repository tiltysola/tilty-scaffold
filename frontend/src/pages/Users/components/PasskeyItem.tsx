import { useIntl } from 'react-intl';

import { FingerprintIcon, Trash2Icon } from 'lucide-react';

import { type PasskeySummary } from '@/lib/auth';
import { formatPasskeyCount, formatPasskeyDeviceType, formatPasskeyDisplayName } from '@/lib/security-display';
import { Badge } from '@/shadcn/components/ui/badge';
import { Button } from '@/shadcn/components/ui/button';
import { Item, ItemContent, ItemDescription, ItemFooter, ItemMedia, ItemTitle } from '@/shadcn/components/ui/item';

import { ConfirmActionDialog } from '@/components/ConfirmActionDialog';

interface PasskeyItemProps {
  disabled: boolean;
  onDeletePasskey: (passkeyId: string) => void;
  passkeys: PasskeySummary[];
}

export function PasskeyItem({ disabled, onDeletePasskey, passkeys }: PasskeyItemProps) {
  const intl = useIntl();

  return (
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
        <ItemDescription>{intl.formatMessage({ id: 'users.edit.passkeys.description' })}</ItemDescription>
      </ItemContent>
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
                  <Button
                    aria-label={intl.formatMessage({ id: 'security.remove.passkey.label' })}
                    disabled={disabled}
                    size="icon"
                    type="button"
                    variant="destructive"
                  >
                    <Trash2Icon />
                  </Button>
                </ConfirmActionDialog>
              </div>
            ))}
          </div>
        </ItemFooter>
      ) : null}
    </Item>
  );
}
