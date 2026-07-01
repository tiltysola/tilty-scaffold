import { useIntl } from 'react-intl';

import { LinkIcon } from 'lucide-react';

import { type SsoIdentityPublic, type SsoPublicProvider } from '@/lib/auth';
import { Button } from '@/shadcn/components/ui/button';
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/shadcn/components/ui/item';

import { ConfirmActionDialog } from '@/components/ConfirmActionDialog';
import SsoProviderIcon from '@/components/SsoProviderIcon';

export function SsoProviderList({
  identities,
  onBind,
  providers,
}: {
  identities: SsoIdentityPublic[];
  onBind: (providerId: string) => void;
  providers: SsoPublicProvider[];
}) {
  const intl = useIntl();

  return (
    <>
      {providers.map((provider) => {
        const identity = identities.find((candidate) => candidate.providerId === provider.id);
        const bindButton = (
          <Button className="w-fit" disabled={Boolean(identity)} size="sm" type="button" variant="outline">
            <LinkIcon />
            {identity ? intl.formatMessage({ id: 'profile.sso.bound' }) : intl.formatMessage({ id: 'common.bind' })}
          </Button>
        );

        return (
          <Item className="rounded-none px-4 py-4 sm:flex-nowrap sm:justify-between" key={provider.id}>
            <ItemMedia className="group-has-data-[slot=item-description]/item:self-center group-has-data-[slot=item-description]/item:translate-y-0">
              <SsoProviderIcon iconUrl={provider.iconUrl} name={provider.name} />
            </ItemMedia>
            <ItemContent className="min-w-0">
              <ItemTitle>{provider.name}</ItemTitle>
              <ItemDescription className="truncate text-xs">
                {identity
                  ? intl.formatMessage({ id: 'profile.sso.bound.as' }, { email: identity.email })
                  : intl.formatMessage({ id: 'profile.sso.provider.description' })}
              </ItemDescription>
            </ItemContent>
            <ItemActions className="ml-auto">
              {identity ? (
                bindButton
              ) : (
                <ConfirmActionDialog
                  confirmLabel={intl.formatMessage({ id: 'profile.sso.bind.provider' })}
                  confirmVariant="default"
                  description={intl.formatMessage({ id: 'profile.sso.bind.provider.description' })}
                  onConfirm={() => onBind(provider.id)}
                  title={intl.formatMessage({ id: 'profile.sso.bind.provider.title' }, { name: provider.name })}
                >
                  {bindButton}
                </ConfirmActionDialog>
              )}
            </ItemActions>
          </Item>
        );
      })}
    </>
  );
}
