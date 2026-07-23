import { useIntl } from 'react-intl';

import { cn } from '@/shadcn/lib/utils';

export function SiteIconAttribution({ className }: { className?: string }) {
  const intl = useIntl();

  return (
    <p className={cn('text-xs text-muted-foreground', className)}>
      {intl.formatMessage({ id: 'app.icon.attribution' })}{' '}
      <a
        className="underline-offset-4 hover:text-foreground hover:underline"
        href="https://game-icons.net/1x1/lorc/pointy-hat.html"
        rel="noopener noreferrer"
        target="_blank"
      >
        Game-icons.net
      </a>{' '}
      ·{' '}
      <a
        className="underline-offset-4 hover:text-foreground hover:underline"
        href="https://creativecommons.org/licenses/by/3.0/"
        rel="license noopener noreferrer"
        target="_blank"
      >
        CC BY 3.0
      </a>
    </p>
  );
}
