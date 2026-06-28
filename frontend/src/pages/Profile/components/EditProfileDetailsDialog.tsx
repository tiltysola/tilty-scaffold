import { type SubmitEventHandler } from 'react';

import { SaveIcon } from 'lucide-react';

import { Button } from '@/shadcn/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shadcn/components/ui/dialog';
import { Input } from '@/shadcn/components/ui/input';
import { Label } from '@/shadcn/components/ui/label';
import { Textarea } from '@/shadcn/components/ui/textarea';

import BirthdayPicker from '@/components/BirthdayPicker';
import FormMessage from '@/components/FormMessage';
import { ProfileGenderInput, ProfileLocationInput } from '@/components/ProfileInputs';

export interface ProfileDetailsDraft {
  displayName: string;
  gender: string;
  birthday: string;
  bio: string;
  location: string;
  websiteUrl: string;
}

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
  const updateProfileDetail = (field: keyof ProfileDetailsDraft, value: string) => {
    onProfileDetailsChange({
      ...profileDetails,
      [field]: value,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit profile details</DialogTitle>
          <DialogDescription>Update public profile information.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="displayName">Display name</Label>
            <Input
              autoComplete="name"
              disabled={disabled}
              id="displayName"
              name="displayName"
              onChange={(event) => updateProfileDetail('displayName', event.target.value)}
              value={profileDetails.displayName}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              disabled={disabled}
              id="bio"
              maxLength={280}
              name="bio"
              onChange={(event) => updateProfileDetail('bio', event.target.value)}
              placeholder="Introduce yourself"
              rows={4}
              value={profileDetails.bio}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="gender">Gender</Label>
            <ProfileGenderInput
              disabled={disabled}
              id="gender"
              name="gender"
              onValueChange={(value) => updateProfileDetail('gender', value)}
              value={profileDetails.gender}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="birthday">Birthday</Label>
            <BirthdayPicker
              disabled={disabled}
              id="birthday"
              name="birthday"
              onChange={(value) => updateProfileDetail('birthday', value)}
              value={profileDetails.birthday}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="location">Location</Label>
            <ProfileLocationInput
              disabled={disabled}
              id="location"
              name="location"
              onValueChange={(value) => updateProfileDetail('location', value)}
              value={profileDetails.location}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="websiteUrl">Homepage</Label>
            <Input
              autoComplete="url"
              disabled={disabled}
              id="websiteUrl"
              name="websiteUrl"
              onChange={(event) => updateProfileDetail('websiteUrl', event.target.value)}
              placeholder="https://example.com"
              type="url"
              value={profileDetails.websiteUrl}
            />
          </div>
          <FormMessage message={error} variant="error" />
          <DialogFooter>
            <DialogClose asChild>
              <Button disabled={disabled} type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button disabled={disabled || !changed} type="submit">
              <SaveIcon />
              {disabled ? 'Saving' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
