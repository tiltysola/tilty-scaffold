import { type SubmitEventHandler } from 'react';
import { useIntl } from 'react-intl';

import { SaveIcon } from 'lucide-react';

import { Button } from '@/shadcn/components/ui/button';
import { Input } from '@/shadcn/components/ui/input';
import { Label } from '@/shadcn/components/ui/label';
import { Textarea } from '@/shadcn/components/ui/textarea';

import { AppDialogClose, AppDialogForm } from '@/components/AppDialog';
import BirthdayPicker from '@/components/BirthdayPicker';
import FormMessage from '@/components/FormMessage';
import { ProfileGenderInput, ProfileLocationInput } from '@/components/ProfileInputs';

import { type ProfileDetailsDraft } from '../utils';

export function EditProfileDetailsDialog({
  changed,
  disabled,
  error,
  onOpenChange,
  onProfileDetailsChange,
  onSubmit,
  open,
  profileDetails,
}: {
  changed: boolean;
  disabled: boolean;
  error?: string | null;
  onOpenChange: (open: boolean) => void;
  onProfileDetailsChange: (details: ProfileDetailsDraft) => void;
  onSubmit: SubmitEventHandler<HTMLFormElement>;
  open: boolean;
  profileDetails: ProfileDetailsDraft;
}) {
  const intl = useIntl();
  const updateProfileDetail = (field: keyof ProfileDetailsDraft, value: string) => {
    onProfileDetailsChange({
      ...profileDetails,
      [field]: value,
    });
  };

  return (
    <AppDialogForm
      bodyContentClassName="grid gap-4"
      description={intl.formatMessage({ id: 'profile.details.edit.description' })}
      footer={
        <>
          <AppDialogClose asChild>
            <Button disabled={disabled} type="button" variant="outline">
              {intl.formatMessage({ id: 'common.cancel' })}
            </Button>
          </AppDialogClose>
          <Button disabled={disabled || !changed} type="submit">
            <SaveIcon />
            {disabled ? intl.formatMessage({ id: 'common.saving' }) : intl.formatMessage({ id: 'common.save.changes' })}
          </Button>
        </>
      }
      onOpenChange={onOpenChange}
      onSubmit={onSubmit}
      open={open}
      title={intl.formatMessage({ id: 'profile.details.edit.title' })}
    >
      <div className="grid gap-2">
        <Label htmlFor="displayName">{intl.formatMessage({ id: 'profile.display.name' })}</Label>
        <Input
          autoComplete="name"
          disabled={disabled}
          id="displayName"
          name="displayName"
          onChange={(event) => updateProfileDetail('displayName', event.target.value)}
          placeholder={intl.formatMessage({ id: 'profile.display.name.placeholder' })}
          value={profileDetails.displayName}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="bio">{intl.formatMessage({ id: 'profile.bio' })}</Label>
        <Textarea
          disabled={disabled}
          id="bio"
          maxLength={280}
          name="bio"
          onChange={(event) => updateProfileDetail('bio', event.target.value)}
          placeholder={intl.formatMessage({ id: 'profile.introduce.self.placeholder' })}
          rows={4}
          value={profileDetails.bio}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="gender">{intl.formatMessage({ id: 'profile.gender' })}</Label>
        <ProfileGenderInput
          disabled={disabled}
          id="gender"
          name="gender"
          onValueChange={(value) => updateProfileDetail('gender', value)}
          value={profileDetails.gender}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="birthday">{intl.formatMessage({ id: 'profile.birthday' })}</Label>
        <BirthdayPicker
          disabled={disabled}
          id="birthday"
          name="birthday"
          onChange={(value) => updateProfileDetail('birthday', value)}
          value={profileDetails.birthday}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="location">{intl.formatMessage({ id: 'profile.location' })}</Label>
        <ProfileLocationInput
          disabled={disabled}
          id="location"
          name="location"
          onValueChange={(value) => updateProfileDetail('location', value)}
          value={profileDetails.location}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="websiteUrl">{intl.formatMessage({ id: 'profile.homepage' })}</Label>
        <Input
          autoComplete="url"
          disabled={disabled}
          id="websiteUrl"
          name="websiteUrl"
          onChange={(event) => updateProfileDetail('websiteUrl', event.target.value)}
          placeholder={intl.formatMessage({ id: 'profile.website.placeholder' })}
          type="url"
          value={profileDetails.websiteUrl}
        />
      </div>
      <FormMessage message={error} variant="error" />
    </AppDialogForm>
  );
}
