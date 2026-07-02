import { useIntl } from 'react-intl';

import { type SsoIdentityPublic, type SsoPublicProvider } from '@/lib/auth';

import { ProfileSection } from '@/components/ProfileCardList';

import { SsoProviderList } from './SsoProviderList';

interface ProfileSsoSectionProps {
  identities: SsoIdentityPublic[];
  onBind: (providerId: string) => void;
  providers: SsoPublicProvider[];
}

export function ProfileSsoSection({ identities, onBind, providers }: ProfileSsoSectionProps) {
  const intl = useIntl();

  return (
    <ProfileSection
      description={intl.formatMessage({ id: 'profile.sign.in.methods.description' })}
      title={intl.formatMessage({ id: 'profile.sign.in.methods' })}
    >
      <SsoProviderList identities={identities} onBind={onBind} providers={providers} />
    </ProfileSection>
  );
}
