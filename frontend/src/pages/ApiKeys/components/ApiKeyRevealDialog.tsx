import { useIntl } from 'react-intl';

import { CopyIcon } from 'lucide-react';

import { type ApiKeyReveal } from '@/lib/api-keys';
import { Button } from '@/shadcn/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/shadcn/components/ui/field';

import { AppDialog, AppDialogClose } from '@/components/AppDialog';

interface ApiKeyRevealDialogProps {
  keyData: ApiKeyReveal | null;
  onCopy: (value: string) => Promise<void>;
  onOpenChange: (open: boolean) => void;
}

export function ApiKeyRevealDialog({ keyData, onCopy, onOpenChange }: ApiKeyRevealDialogProps) {
  const intl = useIntl();

  return (
    <AppDialog
      description={intl.formatMessage({ id: 'api.keys.reveal.description' })}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => keyData && void onCopy(keyData.plainKey)}>
            <CopyIcon data-icon="inline-start" />
            {intl.formatMessage({ id: 'api.keys.copy' })}
          </Button>
          <AppDialogClose asChild>
            <Button type="button">{intl.formatMessage({ id: 'api.keys.saved' })}</Button>
          </AppDialogClose>
        </>
      }
      open={Boolean(keyData)}
      title={intl.formatMessage({ id: 'api.keys.reveal.title' })}
      onOpenChange={onOpenChange}
    >
      {keyData ? (
        <FieldGroup>
          <Field>
            <FieldLabel>{intl.formatMessage({ id: 'api.keys.key' })}</FieldLabel>
            <code className="block rounded-lg bg-muted p-3 font-mono text-xs break-all text-muted-foreground">
              {keyData.plainKey}
            </code>
          </Field>
        </FieldGroup>
      ) : null}
    </AppDialog>
  );
}
