import { useIntl } from 'react-intl';

import { CopyIcon } from 'lucide-react';

import { Button } from '@/shadcn/components/ui/button';

import { AppDialogBody, AppDialogClose, AppDialogFooter } from '@/components/AppDialog';

export function RecoveryCodes({ codes, onCopy }: { codes: string[]; onCopy: () => void }) {
  const intl = useIntl();

  return (
    <>
      <AppDialogBody contentClassName="grid gap-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {codes.map((code) => (
            <code className="rounded-md bg-muted px-3 py-2 text-center text-sm" key={code}>
              {code}
            </code>
          ))}
        </div>
      </AppDialogBody>
      <AppDialogFooter>
        <Button onClick={onCopy} type="button" variant="outline">
          <CopyIcon />
          {intl.formatMessage({ id: 'security.copy.recovery.codes' })}
        </Button>
        <AppDialogClose asChild>
          <Button type="button">{intl.formatMessage({ id: 'common.done' })}</Button>
        </AppDialogClose>
      </AppDialogFooter>
    </>
  );
}
