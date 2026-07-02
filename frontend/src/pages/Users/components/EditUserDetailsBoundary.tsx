import { type ReactNode } from 'react';
import { useIntl } from 'react-intl';

import { Button } from '@/shadcn/components/ui/button';
import { Spinner } from '@/shadcn/components/ui/spinner';

interface EditUserDetailsBoundaryProps {
  children: ReactNode;
  error: string | null;
  loading: boolean;
  onRetry: () => void;
}

export function EditUserDetailsBoundary({ children, error, loading, onRetry }: EditUserDetailsBoundaryProps) {
  const intl = useIntl();

  if (loading) {
    return (
      <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        {intl.formatMessage({ id: 'users.edit.details.loading' })}
      </div>
    );
  }

  if (error) {
    return (
      <div className="grid min-h-48 place-items-center rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        <div className="grid justify-items-center gap-3">
          <span>{error}</span>
          <Button onClick={onRetry} size="sm" type="button" variant="outline">
            {intl.formatMessage({ id: 'common.retry' })}
          </Button>
        </div>
      </div>
    );
  }

  return children;
}
