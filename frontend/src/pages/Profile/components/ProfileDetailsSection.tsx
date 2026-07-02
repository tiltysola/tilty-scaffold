import { useIntl } from 'react-intl';

import { CalendarDaysIcon, FileTextIcon, LinkIcon, MapPinIcon, UserPenIcon, UserRoundIcon } from 'lucide-react';

import { type AuthUser } from '@/lib/auth';
import { ItemSeparator } from '@/shadcn/components/ui/item';

import { ProfileItem, ProfileSection } from '@/components/ProfileCardList';

import { formatProfileBirthday, formatProfileDetail, formatProfileLocation } from '../utils';

interface ProfileDetailsSectionProps {
  onEdit: () => void;
  user: AuthUser;
}

export function ProfileDetailsSection({ onEdit, user }: ProfileDetailsSectionProps) {
  const intl = useIntl();
  const notSet = intl.formatMessage({ id: 'common.not.set' });

  return (
    <ProfileSection
      actionIcon={<UserPenIcon />}
      actionLabel={intl.formatMessage({ id: 'common.edit' })}
      description={intl.formatMessage({ id: 'profile.details.description' })}
      onAction={onEdit}
      title={intl.formatMessage({ id: 'profile.details' })}
    >
      <ProfileItem
        description={user.displayName}
        icon={<UserPenIcon className="size-4" />}
        title={intl.formatMessage({ id: 'profile.display.name' })}
      />

      <ItemSeparator className="!my-0" />

      <ProfileItem
        description={formatProfileDetail(user.bio, notSet)}
        icon={<FileTextIcon className="size-4" />}
        title={intl.formatMessage({ id: 'profile.bio' })}
      />

      <ItemSeparator className="!my-0" />

      <ProfileItem
        description={formatProfileDetail(user.gender, notSet)}
        icon={<UserRoundIcon className="size-4" />}
        title={intl.formatMessage({ id: 'profile.gender' })}
      />

      <ItemSeparator className="!my-0" />

      <ProfileItem
        description={formatProfileBirthday(user.birthday, notSet, intl.locale)}
        icon={<CalendarDaysIcon className="size-4" />}
        title={intl.formatMessage({ id: 'profile.birthday' })}
      />

      <ItemSeparator className="!my-0" />

      <ProfileItem
        description={formatProfileLocation(user.location, notSet)}
        icon={<MapPinIcon className="size-4" />}
        title={intl.formatMessage({ id: 'profile.location' })}
      />

      <ItemSeparator className="!my-0" />

      <ProfileItem
        description={formatProfileDetail(user.websiteUrl, notSet)}
        icon={<LinkIcon className="size-4" />}
        title={intl.formatMessage({ id: 'profile.homepage' })}
      />
    </ProfileSection>
  );
}
