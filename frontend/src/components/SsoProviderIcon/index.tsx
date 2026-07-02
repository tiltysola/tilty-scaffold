import { BadgeCheckIcon } from 'lucide-react';

type SsoProviderIconSize = 'compact' | 'default';

interface SsoProviderIconProps {
  iconUrl?: string;
  name: string;
  size?: SsoProviderIconSize;
}

const iconSizeClassNames: Record<
  SsoProviderIconSize,
  {
    fallback: string;
    fallbackIcon: string;
    image: string;
  }
> = {
  compact: {
    fallback: 'flex size-4 items-center justify-center rounded-sm border text-muted-foreground',
    fallbackIcon: 'size-3',
    image: 'size-4 rounded-sm object-contain',
  },
  default: {
    fallback: 'flex size-7 items-center justify-center rounded-md border text-muted-foreground',
    fallbackIcon: 'size-4',
    image: 'size-7 rounded-md border object-contain p-1',
  },
};

function Index({ iconUrl, name, size = 'default' }: SsoProviderIconProps) {
  const classNames = iconSizeClassNames[size];

  return iconUrl ? (
    <img alt="" className={classNames.image} referrerPolicy="no-referrer" src={iconUrl} />
  ) : (
    <div aria-label={name} className={classNames.fallback} role="img">
      <BadgeCheckIcon className={classNames.fallbackIcon} />
    </div>
  );
}

export default Index;
