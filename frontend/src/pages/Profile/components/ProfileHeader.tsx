import { type Ref } from 'react';

import { EllipsisVerticalIcon, ImageIcon, ImageUpIcon, PencilIcon } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/shadcn/components/ui/avatar';
import { Button } from '@/shadcn/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shadcn/components/ui/dropdown-menu';

export function ProfileHeader({
  actionClassName,
  avatarAlt,
  avatarBusy,
  avatarUrl,
  bannerBusy,
  bannerUrl,
  descriptionClassName,
  fallback,
  onChangeAvatar,
  onChangeBanner,
  onEditProfileDetails,
  sectionRef,
  textRef,
  title,
  titleClassName,
  uploadingAvatar,
  uploadingBanner,
  userHandle,
}: {
  actionClassName?: string;
  avatarAlt: string;
  avatarBusy: boolean;
  avatarUrl: string | undefined;
  bannerBusy: boolean;
  bannerUrl: string | undefined;
  descriptionClassName?: string;
  fallback: string;
  onChangeAvatar: () => void;
  onChangeBanner: () => void;
  onEditProfileDetails: () => void;
  sectionRef: Ref<HTMLElement>;
  textRef: Ref<HTMLDivElement>;
  title: string;
  titleClassName?: string;
  uploadingAvatar: boolean;
  uploadingBanner: boolean;
  userHandle: string;
}) {
  return (
    <section ref={sectionRef} className="relative min-h-32 overflow-hidden rounded-lg bg-muted/40 p-4">
      {bannerUrl ? (
        <img alt="" aria-hidden="true" className="absolute inset-0 size-full object-cover" src={bannerUrl} />
      ) : (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-40 [background-image:repeating-linear-gradient(135deg,transparent_0,transparent_10px,var(--border)_10px,var(--border)_11px)]"
        />
      )}
      <div className="relative flex min-h-24 min-w-0 items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar className="size-10 sm:size-20" key={avatarUrl ?? 'avatar-fallback'}>
            {avatarUrl ? <AvatarImage alt={avatarAlt} src={avatarUrl} /> : null}
            <AvatarFallback className="sm:text-xl">{fallback}</AvatarFallback>
          </Avatar>
          <div ref={textRef} className="min-w-0">
            <h2 className={titleClassName}>{title}</h2>
            <p className={descriptionClassName}>{userHandle}</p>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className={actionClassName} size="icon-sm" type="button" variant="ghost">
              <EllipsisVerticalIcon />
              <span className="sr-only">Open profile actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuItem disabled={avatarBusy} onSelect={onChangeAvatar}>
              <ImageUpIcon />
              {uploadingAvatar ? 'Uploading' : 'Change avatar'}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={bannerBusy} onSelect={onChangeBanner}>
              <ImageIcon />
              {uploadingBanner ? 'Uploading' : 'Change profile banner'}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onEditProfileDetails}>
              <PencilIcon />
              Edit profile details
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </section>
  );
}
