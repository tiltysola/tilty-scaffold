import { type ChangeEvent, type FormEventHandler, useRef, useState } from 'react';

import { EllipsisVerticalIcon, ImageUpIcon, PencilIcon, SaveIcon } from 'lucide-react';
import { toast } from 'sonner';

import { useAsyncAction } from '@/hooks/useAsyncAction';
import { getApiErrorMessage } from '@/lib/api';
import {
  getStoredSession,
  getUserHandle,
  getUserInitials,
  resolveAssetUrl,
  updateCurrentUser,
  uploadAvatar,
} from '@/lib/auth';
import { displayNameSchema } from '@/lib/auth-validation';
import { Avatar, AvatarFallback, AvatarImage } from '@/shadcn/components/ui/avatar';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shadcn/components/ui/dropdown-menu';
import { Input } from '@/shadcn/components/ui/input';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from '@/shadcn/components/ui/item';
import { Label } from '@/shadcn/components/ui/label';

import FormMessage from '@/components/FormMessage';

const Index = () => {
  const initialUser = getStoredSession()?.user ?? null;
  const [user, setUser] = useState(initialUser);
  const [displayNameDraft, setDisplayNameDraft] = useState(initialUser?.displayName ?? '');
  const [editingDisplayName, setEditingDisplayName] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const profileAction = useAsyncAction();
  const avatarUrl = resolveAssetUrl(user?.avatarUrl);
  const fallback = getUserInitials(user?.displayName);
  const userHandle = getUserHandle(user?.username);
  const savingProfile = profileAction.pending;
  const displayNameChanged = displayNameDraft.trim() !== (user?.displayName ?? '');

  const handleAvatarSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];

    event.currentTarget.value = '';

    if (!file) {
      return;
    }

    setUploadingAvatar(true);

    try {
      const updatedUser = await uploadAvatar(file);

      setUser(updatedUser);
      setDisplayNameDraft(updatedUser.displayName);
      toast.success('Avatar updated.');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Avatar upload failed.'));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleProfileSubmit: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    profileAction.clearError();

    const parsed = displayNameSchema.safeParse(displayNameDraft);

    if (!parsed.success) {
      profileAction.setError(parsed.error.issues[0]?.message ?? 'Display name is invalid.');
      return;
    }

    const updatedUser = await profileAction.run(
      () =>
        updateCurrentUser({
          displayName: parsed.data,
        }),
      'Profile could not be updated.',
    );

    if (updatedUser) {
      setUser(updatedUser);
      setDisplayNameDraft(updatedUser.displayName);
      setEditingDisplayName(false);
      toast.success('Profile updated.');
    }
  };

  const handleEditDisplayName = () => {
    setDisplayNameDraft(user?.displayName ?? '');
    profileAction.clearError();
    setEditingDisplayName(true);
  };

  return (
    <div className="grid min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">
      <ItemGroup className="mx-auto w-full max-w-[800px] self-start gap-0! overflow-hidden rounded-lg border bg-card has-data-[size=sm]:gap-0! has-data-[size=xs]:gap-0!">
        <Item className="rounded-none px-4 py-4">
          <input
            ref={fileInputRef}
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={handleAvatarSelect}
            type="file"
          />
          <ItemMedia className="size-12 rounded-lg" variant="image">
            <Avatar className="h-full w-full rounded-lg after:hidden">
              {avatarUrl ? (
                <AvatarImage className="rounded-lg" src={avatarUrl} alt={user?.displayName ?? 'User'} />
              ) : null}
              <AvatarFallback className="rounded-lg">{fallback}</AvatarFallback>
            </Avatar>
          </ItemMedia>
          <ItemContent className="gap-0 text-sm leading-tight">
            <ItemTitle>{user?.displayName ?? 'Signed-in user'}</ItemTitle>
            <ItemDescription className="text-xs">{userHandle}</ItemDescription>
          </ItemContent>
          <ItemActions>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon-sm" type="button" variant="ghost">
                  <EllipsisVerticalIcon />
                  <span className="sr-only">Open profile actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-44">
                <DropdownMenuItem
                  disabled={uploadingAvatar}
                  onSelect={(event: Event) => {
                    event.preventDefault();
                    fileInputRef.current?.click();
                  }}
                >
                  <ImageUpIcon />
                  {uploadingAvatar ? 'Uploading' : 'Change avatar'}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={handleEditDisplayName}>
                  <PencilIcon />
                  Edit display name
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </ItemActions>
        </Item>

        <ItemSeparator className="!my-0" />

        <ProfileItem description={user?.email ?? 'Not available'} title="Email" />

        <ItemSeparator className="!my-0" />

        <ProfileItem description={formatList(user?.roles, 'No roles')} title="Roles" />

        <ItemSeparator className="!my-0" />

        <ProfileItem description={formatList(user?.permissions, 'No permissions')} title="Permissions" />
      </ItemGroup>
      <Dialog open={editingDisplayName} onOpenChange={setEditingDisplayName}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit display name</DialogTitle>
            <DialogDescription>Update the display name shown across the application.</DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={handleProfileSubmit}>
            <div className="grid gap-2">
              <Label htmlFor="displayName">Display name</Label>
              <Input
                autoComplete="name"
                disabled={savingProfile}
                id="displayName"
                name="displayName"
                onChange={(event) => setDisplayNameDraft(event.target.value)}
                value={displayNameDraft}
              />
            </div>
            <FormMessage message={profileAction.error} variant="error" />
            <DialogFooter>
              <DialogClose asChild>
                <Button disabled={savingProfile} type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button disabled={savingProfile || !displayNameChanged} type="submit">
                <SaveIcon />
                {savingProfile ? 'Saving' : 'Save changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

function ProfileItem({ description, title }: { description: string; title: string }) {
  return (
    <Item className="rounded-none px-4 py-4">
      <ItemContent>
        <ItemTitle>{title}</ItemTitle>
        <ItemDescription className="break-words">{description}</ItemDescription>
      </ItemContent>
    </Item>
  );
}

function formatList(values: string[] | undefined, emptyLabel: string) {
  return values?.length ? values.join(', ') : emptyLabel;
}

export default Index;
