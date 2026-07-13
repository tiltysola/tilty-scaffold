import { useIntl } from 'react-intl';

import ImageCropDialog from '@/components/ImageCropDialog';

interface ProfileImageCropDialogsProps {
  avatarCropImageUrl: string | null;
  avatarOpen: boolean;
  avatarUrl?: string;
  avatarUploadError: string | null;
  deletingAvatar: boolean;
  deletingProfileBanner: boolean;
  deletingProfileBackground: boolean;
  maxFileBytes: number | null;
  onAvatarImageSelect: (file: File) => void;
  onAvatarOpenChange: (open: boolean) => void;
  onAvatarRemove: () => Promise<void> | void;
  onAvatarSubmit: (file: File) => Promise<void> | void;
  onProfileBannerImageSelect: (file: File) => void;
  onProfileBannerOpenChange: (open: boolean) => void;
  onProfileBannerRemove: () => Promise<void> | void;
  onProfileBannerSubmit: (file: File) => Promise<void> | void;
  onProfileBackgroundImageSelect: (file: File) => void;
  onProfileBackgroundOpenChange: (open: boolean) => void;
  onProfileBackgroundRemove: () => Promise<void> | void;
  onProfileBackgroundSubmit: (file: File) => Promise<void> | void;
  profileBannerCropImageUrl: string | null;
  profileBannerOpen: boolean;
  profileBannerUploadError: string | null;
  profileBannerUrl?: string;
  profileBackgroundCropImageUrl: string | null;
  profileBackgroundOpen: boolean;
  profileBackgroundUploadError: string | null;
  profileBackgroundUrl?: string;
  uploadingAvatar: boolean;
  uploadingProfileBanner: boolean;
  uploadingProfileBackground: boolean;
}

export function ProfileImageCropDialogs({
  avatarCropImageUrl,
  avatarOpen,
  avatarUploadError,
  avatarUrl,
  deletingAvatar,
  deletingProfileBanner,
  deletingProfileBackground,
  maxFileBytes,
  onAvatarImageSelect,
  onAvatarOpenChange,
  onAvatarRemove,
  onAvatarSubmit,
  onProfileBannerImageSelect,
  onProfileBannerOpenChange,
  onProfileBannerRemove,
  onProfileBannerSubmit,
  onProfileBackgroundImageSelect,
  onProfileBackgroundOpenChange,
  onProfileBackgroundRemove,
  onProfileBackgroundSubmit,
  profileBannerCropImageUrl,
  profileBannerOpen,
  profileBannerUploadError,
  profileBannerUrl,
  profileBackgroundCropImageUrl,
  profileBackgroundOpen,
  profileBackgroundUploadError,
  profileBackgroundUrl,
  uploadingAvatar,
  uploadingProfileBanner,
  uploadingProfileBackground,
}: ProfileImageCropDialogsProps) {
  const intl = useIntl();

  return (
    <>
      <ImageCropDialog
        aspect={1}
        cropShape="round"
        description={intl.formatMessage({ id: 'profile.personalization.avatar.upload.description' })}
        error={avatarUploadError}
        imageSelectLabel={intl.formatMessage({ id: 'profile.image.select' })}
        imageUrl={avatarCropImageUrl}
        loading={uploadingAvatar}
        maxFileBytes={maxFileBytes ?? undefined}
        onImageSelect={onAvatarImageSelect}
        onOpenChange={onAvatarOpenChange}
        onRemove={avatarUrl ? onAvatarRemove : undefined}
        onSubmit={onAvatarSubmit}
        open={avatarOpen}
        output={{
          fileName: 'avatar.png',
          height: 512,
          width: 512,
        }}
        removeLabel={intl.formatMessage({ id: 'common.remove' })}
        removeLoading={deletingAvatar}
        showGrid={false}
        submitLabel={intl.formatMessage({ id: 'common.upload' })}
        title={intl.formatMessage({ id: 'profile.image.upload.avatar' })}
      />
      <ImageCropDialog
        aspect={4}
        description={intl.formatMessage({ id: 'profile.personalization.banner.upload.description' })}
        error={profileBannerUploadError}
        imageSelectLabel={intl.formatMessage({ id: 'profile.image.select' })}
        imageUrl={profileBannerCropImageUrl}
        loading={uploadingProfileBanner}
        maxFileBytes={maxFileBytes ?? undefined}
        onImageSelect={onProfileBannerImageSelect}
        onOpenChange={onProfileBannerOpenChange}
        onRemove={profileBannerUrl ? onProfileBannerRemove : undefined}
        onSubmit={onProfileBannerSubmit}
        open={profileBannerOpen}
        output={{
          contentType: 'image/webp',
          fileName: 'profile-banner.webp',
          height: 400,
          width: 1600,
        }}
        removeLabel={intl.formatMessage({ id: 'common.remove' })}
        removeLoading={deletingProfileBanner}
        showAdjustments
        submitLabel={intl.formatMessage({ id: 'common.upload' })}
        title={intl.formatMessage({ id: 'profile.image.upload.banner' })}
      />
      <ImageCropDialog
        aspect={16 / 9}
        description={intl.formatMessage({ id: 'profile.personalization.background.upload.description' })}
        error={profileBackgroundUploadError}
        imageSelectLabel={intl.formatMessage({ id: 'profile.image.select' })}
        imageUrl={profileBackgroundCropImageUrl}
        loading={uploadingProfileBackground}
        maxFileBytes={maxFileBytes ?? undefined}
        onImageSelect={onProfileBackgroundImageSelect}
        onOpenChange={onProfileBackgroundOpenChange}
        onRemove={profileBackgroundUrl ? onProfileBackgroundRemove : undefined}
        onSubmit={onProfileBackgroundSubmit}
        open={profileBackgroundOpen}
        output={{
          contentType: 'image/webp',
          fileName: 'profile-background.webp',
          height: 1080,
          width: 1920,
        }}
        removeLabel={intl.formatMessage({ id: 'common.remove' })}
        removeLoading={deletingProfileBackground}
        showAdjustments
        submitLabel={intl.formatMessage({ id: 'common.upload' })}
        title={intl.formatMessage({ id: 'profile.image.upload.background' })}
      />
    </>
  );
}
