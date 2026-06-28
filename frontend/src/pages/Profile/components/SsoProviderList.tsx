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
  return (
    <>
      {providers.map((provider) => {
        const identity = identities.find((candidate) => candidate.providerId === provider.id);
        const bindButton = (
          <Button className="w-fit" disabled={Boolean(identity)} size="sm" type="button" variant="outline">
            <LinkIcon />
            {identity ? 'Bound' : 'Bind'}
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
                {identity ? `Bound as ${identity.email}` : 'External sign-in provider'}
              </ItemDescription>
            </ItemContent>
            <ItemActions className="ml-auto">
              {identity ? (
                bindButton
              ) : (
                <ConfirmActionDialog
                  confirmLabel="Bind provider"
                  confirmVariant="default"
                  description="You will be redirected to the provider to link this external sign-in method to your account."
                  onConfirm={() => onBind(provider.id)}
                  title={`Bind ${provider.name}?`}
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
