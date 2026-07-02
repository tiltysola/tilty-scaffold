import { useIntl } from 'react-intl';

import { MailIcon, PhoneIcon } from 'lucide-react';

import { type AuthUser } from '@/lib/auth';
import { ItemSeparator } from '@/shadcn/components/ui/item';

import { ProfileItem, ProfileSection } from '@/components/ProfileCardList';

interface ProfileContactSectionProps {
  emailVerificationActionVisible: boolean;
  emailVerificationAvailable: boolean;
  onEditPhoneNumber: () => void;
  onStartEmailVerification: () => void;
  phoneActionVisible: boolean;
  phoneBindingEnabled: boolean;
  profileEmailVerificationEnabled: boolean;
  user: AuthUser;
}

export function ProfileContactSection({
  emailVerificationActionVisible,
  emailVerificationAvailable,
  onEditPhoneNumber,
  onStartEmailVerification,
  phoneActionVisible,
  phoneBindingEnabled,
  profileEmailVerificationEnabled,
  user,
}: ProfileContactSectionProps) {
  const intl = useIntl();

  return (
    <ProfileSection
      description={intl.formatMessage({ id: 'profile.contact.description' })}
      title={intl.formatMessage({ id: 'profile.contact' })}
    >
      <ProfileItem
        actionDisabled={!emailVerificationAvailable}
        actionIcon={emailVerificationActionVisible ? <MailIcon /> : undefined}
        actionLabel={emailVerificationActionVisible ? intl.formatMessage({ id: 'identity.verify' }) : undefined}
        actionTooltip={
          emailVerificationActionVisible && !profileEmailVerificationEnabled
            ? intl.formatMessage({ id: 'profile.email.verification.unavailable' })
            : undefined
        }
        description={user.email}
        icon={<MailIcon className="size-4" />}
        onAction={emailVerificationActionVisible ? onStartEmailVerification : undefined}
        status={intl.formatMessage({ id: user.emailVerified ? 'common.verified' : 'common.unverified' })}
        statusVariant={user.emailVerified ? 'secondary' : 'outline'}
        title={intl.formatMessage({ id: 'profile.email' })}
      />

      <ItemSeparator className="!my-0" />

      <ProfileItem
        actionDisabled={!phoneBindingEnabled}
        actionIcon={phoneActionVisible ? <PhoneIcon /> : undefined}
        actionLabel={
          phoneActionVisible
            ? intl.formatMessage({ id: user.phoneNumber ? 'common.change' : 'common.bind' })
            : undefined
        }
        actionTooltip={
          phoneActionVisible && !phoneBindingEnabled
            ? intl.formatMessage({ id: 'profile.phone.binding.unavailable' })
            : undefined
        }
        description={user.phoneNumber ?? intl.formatMessage({ id: 'common.not.bound' })}
        icon={<PhoneIcon className="size-4" />}
        onAction={phoneActionVisible ? onEditPhoneNumber : undefined}
        status={
          user.phoneNumber
            ? intl.formatMessage({ id: user.phoneVerified ? 'common.verified' : 'common.unverified' })
            : undefined
        }
        statusVariant={user.phoneVerified ? 'secondary' : 'outline'}
        title={intl.formatMessage({ id: 'profile.phone' })}
      />
    </ProfileSection>
  );
}
