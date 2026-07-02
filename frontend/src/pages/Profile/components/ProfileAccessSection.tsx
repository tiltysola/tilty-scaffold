import { useIntl } from 'react-intl';

import { UserCogIcon } from 'lucide-react';

import { type AuthUser } from '@/lib/auth';

import { ProfileItem, ProfileSection } from '@/components/ProfileCardList';

import { formatRoleAccessSummary } from '../utils';

interface ProfileAccessSectionProps {
  user: AuthUser;
}

export function ProfileAccessSection({ user }: ProfileAccessSectionProps) {
  const intl = useIntl();

  return (
    <ProfileSection
      description={intl.formatMessage({ id: 'profile.access.description' })}
      title={intl.formatMessage({ id: 'profile.access' })}
    >
      <ProfileItem
        description={formatRoleAccessSummary(
          user.roles,
          user.permissions,
          intl.formatMessage({ id: 'profile.no.roles' }),
        )}
        icon={<UserCogIcon className="size-4" />}
        title={intl.formatMessage({ id: 'profile.roles' })}
      />
    </ProfileSection>
  );
}
