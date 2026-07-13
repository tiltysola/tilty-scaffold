import { useIntl } from 'react-intl';

import { ImageIcon, ImageUpIcon, WallpaperIcon } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/shadcn/components/ui/avatar';
import { ItemSeparator } from '@/shadcn/components/ui/item';

import { ImagePreviewMedia, ImagePreviewTrigger } from '@/components/ImagePreviewDialog';
import { ProfileItem, ProfileSection } from '@/components/ProfileCardList';

export type ProfilePreviewTarget = 'avatar' | 'profileBanner' | 'profileBackground' | null;

interface ProfilePersonalizationSectionProps {
  avatarBusy: boolean;
  avatarUrl?: string;
  fallback: string;
  imageUploadEnabled: boolean;
  onChangeAvatar: () => void;
  onChangeBanner: () => void;
  onChangeBackground: () => void;
  onPreviewTargetChange: (target: ProfilePreviewTarget) => void;
  previewTarget: ProfilePreviewTarget;
  profileBannerBusy: boolean;
  profileBannerUrl?: string;
  profileBackgroundBusy: boolean;
  profileBackgroundUrl?: string;
  userDisplayName: string;
}

export function ProfilePersonalizationSection({
  avatarBusy,
  avatarUrl,
  fallback,
  imageUploadEnabled,
  onChangeAvatar,
  onChangeBanner,
  onChangeBackground,
  onPreviewTargetChange,
  previewTarget,
  profileBannerBusy,
  profileBannerUrl,
  profileBackgroundBusy,
  profileBackgroundUrl,
  userDisplayName,
}: ProfilePersonalizationSectionProps) {
  const intl = useIntl();

  return (
    <ProfileSection
      description={intl.formatMessage({ id: 'profile.personalization.description' })}
      title={intl.formatMessage({ id: 'profile.personalization' })}
    >
      <ProfileItem
        actionDisabled={avatarBusy}
        actionIcon={<ImageUpIcon />}
        actionLabel={imageUploadEnabled ? intl.formatMessage({ id: 'common.change' }) : undefined}
        description={intl.formatMessage({ id: 'profile.personalization.avatar.description' })}
        media={
          <ImagePreviewTrigger
            imageAlt={intl.formatMessage({ id: 'profile.avatar.alt' }, { name: userDisplayName })}
            imageUrl={avatarUrl}
            onOpenChange={(open) => onPreviewTargetChange(open ? 'avatar' : null)}
            open={previewTarget === 'avatar'}
            title={intl.formatMessage({ id: 'profile.avatar.preview' })}
          >
            <Avatar className="size-full">
              <AvatarImage alt={userDisplayName} src={avatarUrl} />
              <AvatarFallback>{fallback}</AvatarFallback>
            </Avatar>
          </ImagePreviewTrigger>
        }
        mediaClassName="size-10 rounded-full"
        mediaVariant="default"
        onAction={imageUploadEnabled ? onChangeAvatar : undefined}
        status={intl.formatMessage({ id: avatarUrl ? 'common.custom' : 'common.default' })}
        statusVariant={avatarUrl ? 'secondary' : 'outline'}
        title={intl.formatMessage({ id: 'profile.avatar' })}
      />

      <ItemSeparator className="!my-0" />

      <ProfileItem
        actionDisabled={profileBannerBusy}
        actionIcon={<ImageUpIcon />}
        actionLabel={imageUploadEnabled ? intl.formatMessage({ id: 'common.change' }) : undefined}
        description={intl.formatMessage({ id: 'profile.personalization.banner.description' })}
        media={
          <ImagePreviewTrigger
            imageAlt={intl.formatMessage({ id: 'profile.banner.alt' }, { name: userDisplayName })}
            imageUrl={profileBannerUrl}
            onOpenChange={(open) => onPreviewTargetChange(open ? 'profileBanner' : null)}
            open={previewTarget === 'profileBanner'}
            title={intl.formatMessage({ id: 'profile.banner.preview' })}
          >
            <ImagePreviewMedia fallbackIcon={<ImageIcon className="size-4" />} imageUrl={profileBannerUrl} />
          </ImagePreviewTrigger>
        }
        mediaClassName="size-10 rounded-full"
        mediaVariant="default"
        onAction={imageUploadEnabled ? onChangeBanner : undefined}
        status={intl.formatMessage({ id: profileBannerUrl ? 'common.custom' : 'common.default' })}
        statusVariant={profileBannerUrl ? 'secondary' : 'outline'}
        title={intl.formatMessage({ id: 'profile.banner' })}
      />

      <ItemSeparator className="!my-0" />

      <ProfileItem
        actionDisabled={profileBackgroundBusy}
        actionIcon={<ImageUpIcon />}
        actionLabel={imageUploadEnabled ? intl.formatMessage({ id: 'common.change' }) : undefined}
        description={intl.formatMessage({ id: 'profile.personalization.background.description' })}
        media={
          <ImagePreviewTrigger
            imageAlt={intl.formatMessage({ id: 'profile.background.alt' }, { name: userDisplayName })}
            imageUrl={profileBackgroundUrl}
            onOpenChange={(open) => onPreviewTargetChange(open ? 'profileBackground' : null)}
            open={previewTarget === 'profileBackground'}
            title={intl.formatMessage({ id: 'profile.background.preview' })}
          >
            <ImagePreviewMedia fallbackIcon={<WallpaperIcon className="size-4" />} imageUrl={profileBackgroundUrl} />
          </ImagePreviewTrigger>
        }
        mediaClassName="size-10 rounded-full"
        mediaVariant="default"
        onAction={imageUploadEnabled ? onChangeBackground : undefined}
        status={intl.formatMessage({ id: profileBackgroundUrl ? 'common.custom' : 'common.default' })}
        statusVariant={profileBackgroundUrl ? 'secondary' : 'outline'}
        title={intl.formatMessage({ id: 'profile.background' })}
      />
    </ProfileSection>
  );
}
