import { useIntl } from 'react-intl';

import { LinkIcon, Trash2Icon } from 'lucide-react';

import { type SsoIdentityPublic } from '@/lib/auth';
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

interface SsoTabProps {
  disabled: boolean;
  identities: SsoIdentityPublic[];
  onDeleteIdentity: (providerId: string) => void;
}

export function SsoTab({ disabled, identities, onDeleteIdentity }: SsoTabProps) {
  const intl = useIntl();

  return (
    <div className="grid gap-4 pt-2">
      <ProfileSection
        description={intl.formatMessage({ id: 'users.edit.sso.bindings.description' })}
        title={intl.formatMessage({ id: 'users.edit.sso.bindings' })}
      >
        {identities.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">
            {intl.formatMessage({ id: 'users.edit.sso.bindings.none' })}
          </div>
        ) : (
          identities.map((identity, index) => (
            <div key={identity.providerId}>
              <Item>
                <ItemMedia>
                  <LinkIcon className="size-4" />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{identity.providerName}</ItemTitle>
                  <ItemDescription>{identity.providerSubject}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <ConfirmActionDialog
                    confirmLabel={intl.formatMessage({ id: 'common.remove' })}
                    description={intl.formatMessage({ id: 'users.edit.remove.sso.binding.description' })}
                    onConfirm={() => onDeleteIdentity(identity.providerId)}
                    title={intl.formatMessage({ id: 'users.edit.remove.sso.binding.title' })}
                  >
                    <Button
                      aria-label={intl.formatMessage({ id: 'users.edit.remove.sso.binding.label' })}
                      disabled={disabled}
                      size="icon"
                      type="button"
                      variant="destructive"
                    >
                      <Trash2Icon />
                    </Button>
                  </ConfirmActionDialog>
                </ItemActions>
              </Item>
              {index < identities.length - 1 ? <ItemSeparator className="!my-0" /> : null}
            </div>
          ))
        )}
      </ProfileSection>
    </div>
  );
}
