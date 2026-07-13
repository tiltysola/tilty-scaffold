import { type FormEvent } from 'react';
import { useIntl } from 'react-intl';

import { PlusIcon } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/shadcn/components/ui/alert';
import { Button } from '@/shadcn/components/ui/button';
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from '@/shadcn/components/ui/field';
import { Input } from '@/shadcn/components/ui/input';
import { Spinner } from '@/shadcn/components/ui/spinner';
import { Switch } from '@/shadcn/components/ui/switch';
import { Textarea } from '@/shadcn/components/ui/textarea';

import { AppDialogClose, AppDialogForm } from '@/components/AppDialog';

import { type ApiKeyDraft, parseExpirationValue } from '../utils';
import { ApiKeyExpirationField } from './ApiKeyExpirationField';

interface ApiKeyCreateDialogProps {
  canCreate: boolean;
  draft: ApiKeyDraft;
  error: string | null;
  limit: number;
  open: boolean;
  pending: boolean;
  onDraftChange: (draft: ApiKeyDraft) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function ApiKeyCreateDialog({
  canCreate,
  draft,
  error,
  limit,
  open,
  pending,
  onDraftChange,
  onOpenChange,
  onSubmit,
}: ApiKeyCreateDialogProps) {
  const intl = useIntl();
  const expirationInvalid = !draft.neverExpires && !parseExpirationValue(draft.expiresAt);
  const createDisabled = pending || !canCreate || !draft.name.trim() || expirationInvalid;

  return (
    <AppDialogForm
      description={intl.formatMessage({ id: 'api.keys.create.description' })}
      footer={
        <>
          <AppDialogClose asChild>
            <Button type="button" variant="outline">
              {intl.formatMessage({ id: 'common.cancel' })}
            </Button>
          </AppDialogClose>
          <Button type="submit" disabled={createDisabled}>
            {pending ? <Spinner data-icon="inline-start" /> : <PlusIcon data-icon="inline-start" />}
            {intl.formatMessage({ id: 'api.keys.create' })}
          </Button>
        </>
      }
      open={open}
      title={intl.formatMessage({ id: 'api.keys.create' })}
      onOpenChange={onOpenChange}
      onSubmit={onSubmit}
    >
      <FieldGroup>
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>{intl.formatMessage({ id: 'api.keys.create.failed' })}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {!canCreate ? (
          <Alert>
            <AlertTitle>{intl.formatMessage({ id: 'api.keys.limit.reached' })}</AlertTitle>
            <AlertDescription>
              {intl.formatMessage({ id: 'api.keys.limit.reached.description' }, { limit })}
            </AlertDescription>
          </Alert>
        ) : null}
        <Field>
          <FieldLabel htmlFor="api-key-name">{intl.formatMessage({ id: 'api.keys.name' })}</FieldLabel>
          <Input
            id="api-key-name"
            maxLength={128}
            onChange={(event) => onDraftChange({ ...draft, name: event.target.value })}
            placeholder={intl.formatMessage({ id: 'api.keys.name.placeholder' })}
            value={draft.name}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="api-key-description">
            {intl.formatMessage({ id: 'api.keys.description.field' })}
          </FieldLabel>
          <Textarea
            id="api-key-description"
            maxLength={512}
            onChange={(event) => onDraftChange({ ...draft, description: event.target.value })}
            placeholder={intl.formatMessage({ id: 'api.keys.description.placeholder' })}
            value={draft.description}
          />
        </Field>
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="api-key-never-expires">
              {intl.formatMessage({ id: 'api.keys.never.expires' })}
            </FieldLabel>
            <FieldDescription>{intl.formatMessage({ id: 'api.keys.never.expires.description' })}</FieldDescription>
          </FieldContent>
          <Switch
            checked={draft.neverExpires}
            id="api-key-never-expires"
            onCheckedChange={(checked: boolean) => onDraftChange({ ...draft, neverExpires: checked })}
          />
        </Field>
        {!draft.neverExpires ? (
          <ApiKeyExpirationField
            value={draft.expiresAt}
            onChange={(expiresAt) => onDraftChange({ ...draft, expiresAt })}
          />
        ) : null}
      </FieldGroup>
    </AppDialogForm>
  );
}
