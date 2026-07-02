import { type Dispatch, type SetStateAction } from 'react';
import { useIntl } from 'react-intl';

import { ImageIcon, ImageUpIcon, WallpaperIcon } from 'lucide-react';

import { resolveAssetUrl } from '@/lib/auth';
import { type UserListItem } from '@/lib/users';
import { Avatar, AvatarFallback, AvatarImage } from '@/shadcn/components/ui/avatar';
import { Input } from '@/shadcn/components/ui/input';
import { ItemSeparator } from '@/shadcn/components/ui/item';
import { Label } from '@/shadcn/components/ui/label';
import { Textarea } from '@/shadcn/components/ui/textarea';

import BirthdayPicker from '@/components/BirthdayPicker';
import { ImagePreviewMedia, ImagePreviewTrigger } from '@/components/ImagePreviewDialog';
import { ProfileItem, ProfileSection } from '@/components/ProfileCardList';
import { ProfileGenderInput, ProfileLocationInput } from '@/components/ProfileInputs';

import { type EditUserForm, getUserFallback, type UserImageTarget } from '../utils';

interface ProfileTabProps {
  disabled: boolean;
  editingDisabled: boolean;
  editingForm: EditUserForm;
  imagePreviewTarget: UserImageTarget | null;
  onFormChange: Dispatch<SetStateAction<EditUserForm>>;
  onOpenImageDialog: (target: UserImageTarget) => void;
  onPreviewOpenChange: (target: UserImageTarget, open: boolean) => void;
  user: UserListItem;
}

export function ProfileTab({
  disabled,
  editingDisabled,
  editingForm,
  imagePreviewTarget,
  onFormChange,
  onOpenImageDialog,
  onPreviewOpenChange,
  user,
}: ProfileTabProps) {
  const intl = useIntl();
  const avatarUrl = resolveAssetUrl(user.avatarUrl);
  const profileBannerUrl = resolveAssetUrl(user.profileBannerUrl);
  const profileBackgroundUrl = resolveAssetUrl(user.profileBackgroundUrl);

  return (
    <div className="grid gap-4 pt-2">
      <ProfileSection
        description={intl.formatMessage({ id: 'profile.details.description' })}
        title={intl.formatMessage({ id: 'profile.details' })}
      >
        <div className="grid gap-4 p-4">
          <div className="grid gap-2">
            <Label htmlFor="editGender">{intl.formatMessage({ id: 'profile.gender' })}</Label>
            <ProfileGenderInput
              disabled={editingDisabled}
              id="editGender"
              onValueChange={(value) => onFormChange((current) => ({ ...current, gender: value }))}
              value={editingForm.gender}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="editBirthday">{intl.formatMessage({ id: 'profile.birthday' })}</Label>
            <BirthdayPicker
              disabled={editingDisabled}
              id="editBirthday"
              name="birthday"
              onChange={(value) => onFormChange((current) => ({ ...current, birthday: value }))}
              value={editingForm.birthday}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="editBio">{intl.formatMessage({ id: 'profile.bio' })}</Label>
            <Textarea
              disabled={editingDisabled}
              id="editBio"
              maxLength={280}
              onChange={(event) => onFormChange((current) => ({ ...current, bio: event.target.value }))}
              placeholder={intl.formatMessage({ id: 'users.edit.introduce.user.placeholder' })}
              rows={4}
              value={editingForm.bio}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="editLocation">{intl.formatMessage({ id: 'profile.location' })}</Label>
            <ProfileLocationInput
              disabled={editingDisabled}
              id="editLocation"
              onValueChange={(value) => onFormChange((current) => ({ ...current, location: value }))}
              value={editingForm.location}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="editWebsiteUrl">{intl.formatMessage({ id: 'profile.homepage' })}</Label>
            <Input
              autoComplete="url"
              disabled={editingDisabled}
              id="editWebsiteUrl"
              onChange={(event) => onFormChange((current) => ({ ...current, websiteUrl: event.target.value }))}
              placeholder={intl.formatMessage({ id: 'profile.website.placeholder' })}
              type="url"
              value={editingForm.websiteUrl}
            />
          </div>
        </div>
      </ProfileSection>
      <ProfileSection
        description={intl.formatMessage({ id: 'users.profile.visuals.description' })}
        title={intl.formatMessage({ id: 'users.profile.visuals' })}
      >
        <ProfileItem
          actionDisabled={disabled}
          actionIcon={<ImageUpIcon />}
          actionLabel={intl.formatMessage({ id: 'common.change' })}
          description={intl.formatMessage({ id: 'users.profile.visuals.avatar.description' })}
          media={
            <ImagePreviewTrigger
              imageAlt={intl.formatMessage({ id: 'profile.avatar.alt' }, { name: user.displayName })}
              imageUrl={avatarUrl}
              onOpenChange={(open) => onPreviewOpenChange('avatar', open)}
              open={imagePreviewTarget === 'avatar'}
              title={intl.formatMessage({ id: 'profile.avatar.preview' })}
            >
              <Avatar className="size-full">
                <AvatarImage alt={user.displayName} src={avatarUrl} />
                <AvatarFallback>{getUserFallback(user.displayName)}</AvatarFallback>
              </Avatar>
            </ImagePreviewTrigger>
          }
          mediaClassName="size-10 rounded-full"
          mediaVariant="default"
          onAction={() => onOpenImageDialog('avatar')}
          status={intl.formatMessage({ id: avatarUrl ? 'common.custom' : 'common.default' })}
          statusVariant={avatarUrl ? 'secondary' : 'outline'}
          title={intl.formatMessage({ id: 'profile.avatar' })}
        />
        <ItemSeparator className="!my-0" />
        <ProfileItem
          actionDisabled={disabled}
          actionIcon={<ImageUpIcon />}
          actionLabel={intl.formatMessage({ id: 'common.change' })}
          description={intl.formatMessage({ id: 'users.profile.visuals.banner.description' })}
          media={
            <ImagePreviewTrigger
              imageAlt={intl.formatMessage({ id: 'profile.banner.alt' }, { name: user.displayName })}
              imageUrl={profileBannerUrl}
              onOpenChange={(open) => onPreviewOpenChange('profileBanner', open)}
              open={imagePreviewTarget === 'profileBanner'}
              title={intl.formatMessage({ id: 'profile.banner.preview' })}
            >
              <ImagePreviewMedia fallbackIcon={<ImageIcon className="size-4" />} imageUrl={profileBannerUrl} />
            </ImagePreviewTrigger>
          }
          mediaClassName="size-10 rounded-full"
          mediaVariant="default"
          onAction={() => onOpenImageDialog('profileBanner')}
          status={intl.formatMessage({ id: profileBannerUrl ? 'common.custom' : 'common.default' })}
          statusVariant={profileBannerUrl ? 'secondary' : 'outline'}
          title={intl.formatMessage({ id: 'profile.banner' })}
        />
        <ItemSeparator className="!my-0" />
        <ProfileItem
          actionDisabled={disabled}
          actionIcon={<ImageUpIcon />}
          actionLabel={intl.formatMessage({ id: 'common.change' })}
          description={intl.formatMessage({ id: 'users.profile.visuals.background.description' })}
          media={
            <ImagePreviewTrigger
              imageAlt={intl.formatMessage({ id: 'profile.background.alt' }, { name: user.displayName })}
              imageUrl={profileBackgroundUrl}
              onOpenChange={(open) => onPreviewOpenChange('profileBackground', open)}
              open={imagePreviewTarget === 'profileBackground'}
              title={intl.formatMessage({ id: 'profile.background.preview' })}
            >
              <ImagePreviewMedia fallbackIcon={<WallpaperIcon className="size-4" />} imageUrl={profileBackgroundUrl} />
            </ImagePreviewTrigger>
          }
          mediaClassName="size-10 rounded-full"
          mediaVariant="default"
          onAction={() => onOpenImageDialog('profileBackground')}
          status={intl.formatMessage({ id: profileBackgroundUrl ? 'common.custom' : 'common.default' })}
          statusVariant={profileBackgroundUrl ? 'secondary' : 'outline'}
          title={intl.formatMessage({ id: 'profile.background' })}
        />
      </ProfileSection>
    </div>
  );
}
