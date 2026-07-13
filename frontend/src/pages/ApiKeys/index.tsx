import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';

import { BanIcon, CheckCircleIcon, KeyRoundIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';

import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useVerificationGate, type VerificationGateSubmitInput } from '@/hooks/useVerificationGate';
import { getApiErrorMessage } from '@/lib/api';
import {
  type ApiKeyReveal,
  type ApiKeySummary,
  createApiKey,
  disableApiKey,
  enableApiKey,
  fetchApiKeys,
  revokeApiKey,
} from '@/lib/api-keys';
import { Button } from '@/shadcn/components/ui/button';
import { Spinner } from '@/shadcn/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shadcn/components/ui/table';
import { apiKeyActiveLimitPerUser } from '@tilty/shared/api-keys';
import { AuthVerificationPurpose } from '@tilty/shared/auth';

import { AppEmptyState } from '@/components/AppEmptyState';
import { ConfirmActionDialog } from '@/components/ConfirmActionDialog';
import { IdentityVerificationDialog } from '@/components/IdentityVerification';

import { ApiKeyCreateDialog } from './components/ApiKeyCreateDialog';
import { ApiKeyRevealDialog } from './components/ApiKeyRevealDialog';
import { ApiKeyStatusBadge } from './components/ApiKeyStatusBadge';
import { type ApiKeyDraft, defaultApiKeyDraft, formatDateTime, parseExpirationValue } from './utils';

const Index = () => {
  const [keys, setKeys] = useState<ApiKeySummary[]>([]);
  const [limit, setLimit] = useState(apiKeyActiveLimitPerUser);
  const [accessVerified, setAccessVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<ApiKeyDraft>(defaultApiKeyDraft);
  const [revealedKey, setRevealedKey] = useState<ApiKeyReveal | null>(null);
  const [busyKeyId, setBusyKeyId] = useState<string | null>(null);
  const intl = useIntl();
  const createAction = useAsyncAction();

  const loadKeys = useCallback(
    async (isActive: () => boolean = () => true) => {
      setLoading(true);
      setLoadError(null);

      try {
        const result = await fetchApiKeys();

        if (!isActive()) {
          return;
        }

        setKeys(result.keys);
        setLimit(result.limit);
      } catch (error) {
        if (isActive()) {
          setLoadError(getApiErrorMessage(error, intl.formatMessage({ id: 'api.keys.load.failed' })));
        }
      } finally {
        if (isActive()) {
          setLoading(false);
        }
      }
    },
    [intl],
  );

  const activeKeyCount = useMemo(
    () => keys.filter((key) => key.status === 'active' || key.status === 'disabled').length,
    [keys],
  );
  const visibleKeys = useMemo(() => keys.filter((key) => key.status !== 'revoked'), [keys]);
  const canCreate = activeKeyCount < limit;

  const {
    clearError: clearVerificationError,
    confirmChallenge,
    dismissChallenge,
    error: verificationError,
    pendingChallenge,
    requestChallenge,
    requestPending,
    sendCode,
    sendPending,
    submitPending,
  } = useVerificationGate({ purpose: AuthVerificationPurpose.ManageApiKey });

  useEffect(() => {
    let isActive = true;

    void requestChallenge()
      .then((verified) => {
        if (!isActive) {
          return;
        }

        if (verified) {
          setLoading(true);
          setAccessVerified(true);
        }
      })
      .catch((error: unknown) => {
        if (isActive) {
          setLoadError(getApiErrorMessage(error, intl.formatMessage({ id: 'api.keys.verification.failed' })));
        }
      });

    return () => {
      isActive = false;
    };
  }, [intl, requestChallenge]);

  useEffect(() => {
    if (!accessVerified) {
      return undefined;
    }

    let isActive = true;

    void Promise.resolve().then(() => loadKeys(() => isActive));

    return () => {
      isActive = false;
    };
  }, [accessVerified, loadKeys]);

  const handleRetryAccess = async () => {
    setLoadError(null);

    try {
      const verified = await requestChallenge();

      if (verified) {
        setLoading(true);
        setAccessVerified(true);
      }
    } catch (error) {
      setLoadError(getApiErrorMessage(error, intl.formatMessage({ id: 'api.keys.verification.failed' })));
    }
  };

  const handleConfirmVerification = async (input: VerificationGateSubmitInput) => {
    const verified = await confirmChallenge(input);

    if (verified) {
      setLoadError(null);
      setLoading(true);
      setAccessVerified(true);
    }
  };

  const handleCreateOpenChange = (open: boolean) => {
    setCreateOpen(open);

    if (!open) {
      createAction.clearError();
      setDraft(defaultApiKeyDraft);
    }
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createAction.clearError();

    const name = draft.name.trim();
    const expiresAt = draft.neverExpires ? null : parseExpirationValue(draft.expiresAt);

    if (loading || !canCreate || !name || (!draft.neverExpires && !expiresAt)) {
      return;
    }

    const createdKey = await createAction.run(
      () =>
        createApiKey({
          name,
          description: draft.description.trim() || undefined,
          expiresAt: expiresAt ? expiresAt.toISOString() : undefined,
        }),
      intl.formatMessage({ id: 'api.keys.create.failed' }),
    );

    if (!createdKey) {
      return;
    }

    handleCreateOpenChange(false);
    setRevealedKey(createdKey);
    setKeys((current) => [createdKey, ...current]);
  };

  const handleKeyMutation = async (keyId: string, action: () => Promise<ApiKeySummary>, successMessageId: string) => {
    setBusyKeyId(keyId);

    try {
      const result = await action();

      setKeys((current) => current.map((key) => (key.id === keyId ? result : key)));
      toast.success(intl.formatMessage({ id: successMessageId }));
    } catch (error) {
      toast.error(getApiErrorMessage(error, intl.formatMessage({ id: 'api.keys.action.failed' })));
    } finally {
      setBusyKeyId(null);
    }
  };

  const handleRevealOpenChange = (open: boolean) => {
    if (!open) {
      setRevealedKey(null);
    }
  };

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(intl.formatMessage({ id: 'api.keys.copied' }));
    } catch {
      toast.error(intl.formatMessage({ id: 'api.keys.copy.failed' }));
    }
  };

  return (
    <div className="grid gap-6 p-4 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-normal">{intl.formatMessage({ id: 'api.keys.title' })}</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            {intl.formatMessage({ id: 'api.keys.description' })}
          </p>
        </div>
        {accessVerified ? (
          <div className="flex shrink-0 items-center gap-2">
            <Button onClick={() => handleCreateOpenChange(true)} disabled={!accessVerified || loading || !canCreate}>
              <PlusIcon data-icon="inline-start" />
              {intl.formatMessage({ id: 'api.keys.create' })}
            </Button>
          </div>
        ) : null}
      </div>

      {!accessVerified ? (
        <AppEmptyState
          actions={
            loadError ? (
              <Button onClick={() => void handleRetryAccess()} size="sm" variant="outline">
                <RefreshCwIcon data-icon="inline-start" />
                {intl.formatMessage({ id: 'common.retry' })}
              </Button>
            ) : undefined
          }
          className="min-h-64 p-0"
          description={
            loadError
              ? loadError
              : pendingChallenge
                ? intl.formatMessage({ id: 'api.keys.verify.description' })
                : requestPending
                  ? intl.formatMessage({ id: 'api.keys.verifying' })
                  : intl.formatMessage({ id: 'api.keys.verification.required' })
          }
          icon={<KeyRoundIcon />}
          title={intl.formatMessage({ id: 'api.keys.verify.title' })}
          tone="destructive"
        />
      ) : loadError ? (
        <AppEmptyState
          actions={
            <Button onClick={() => void loadKeys()} size="sm" variant="outline">
              <RefreshCwIcon data-icon="inline-start" />
              {intl.formatMessage({ id: 'common.retry' })}
            </Button>
          }
          className="min-h-64 p-0"
          description={loadError}
          icon={<KeyRoundIcon />}
          title={intl.formatMessage({ id: 'api.keys.load.failed' })}
          tone="destructive"
        />
      ) : (
        <div className="grid gap-4">
          {loading ? (
            <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Spinner />
                <span>{intl.formatMessage({ id: 'common.loading' })}</span>
              </div>
            </div>
          ) : visibleKeys.length === 0 ? (
            <AppEmptyState
              className="min-h-64 p-0"
              description={intl.formatMessage({ id: 'api.keys.empty.description' })}
              icon={<KeyRoundIcon />}
              title={intl.formatMessage({ id: 'api.keys.empty.title' })}
            />
          ) : (
            <Table className="min-w-max">
              <TableHeader>
                <TableRow>
                  <TableHead>{intl.formatMessage({ id: 'api.keys.name' })}</TableHead>
                  <TableHead>{intl.formatMessage({ id: 'api.keys.key' })}</TableHead>
                  <TableHead>{intl.formatMessage({ id: 'api.keys.status' })}</TableHead>
                  <TableHead>{intl.formatMessage({ id: 'api.keys.expires.at' })}</TableHead>
                  <TableHead>{intl.formatMessage({ id: 'api.keys.last.used' })}</TableHead>
                  <TableHead className="text-right">{intl.formatMessage({ id: 'users.action' })}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleKeys.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell className="min-w-48">
                      <div className="flex flex-col gap-1">
                        <span className="font-medium">{key.name}</span>
                        {key.description ? (
                          <span className="line-clamp-1 text-xs text-muted-foreground">{key.description}</span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {key.keyPrefix}...{key.keySuffix}
                    </TableCell>
                    <TableCell>
                      <ApiKeyStatusBadge status={key.status} />
                    </TableCell>
                    <TableCell>
                      {key.expiresAt
                        ? formatDateTime(key.expiresAt, intl.locale)
                        : intl.formatMessage({ id: 'api.keys.never.expires' })}
                    </TableCell>
                    <TableCell>
                      {key.lastUsedAt
                        ? formatDateTime(key.lastUsedAt, intl.locale)
                        : intl.formatMessage({ id: 'api.keys.never.used' })}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        {key.status === 'disabled' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyKeyId === key.id}
                            onClick={() =>
                              void handleKeyMutation(key.id, () => enableApiKey(key.id), 'api.keys.enabled')
                            }
                          >
                            <CheckCircleIcon data-icon="inline-start" />
                            {intl.formatMessage({ id: 'common.enable' })}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={key.status !== 'active' || busyKeyId === key.id}
                            onClick={() =>
                              void handleKeyMutation(key.id, () => disableApiKey(key.id), 'api.keys.disabled')
                            }
                          >
                            <BanIcon data-icon="inline-start" />
                            {intl.formatMessage({ id: 'common.disable' })}
                          </Button>
                        )}
                        <ConfirmActionDialog
                          confirmLabel={intl.formatMessage({ id: 'api.keys.revoke' })}
                          description={intl.formatMessage({ id: 'api.keys.revoke.description' })}
                          onConfirm={() =>
                            void handleKeyMutation(key.id, () => revokeApiKey(key.id), 'api.keys.revoked')
                          }
                          title={intl.formatMessage({ id: 'api.keys.revoke.title' })}
                        >
                          <Button size="sm" variant="destructive" disabled={busyKeyId === key.id}>
                            <Trash2Icon data-icon="inline-start" />
                            {intl.formatMessage({ id: 'api.keys.revoke' })}
                          </Button>
                        </ConfirmActionDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      <ApiKeyCreateDialog
        canCreate={canCreate}
        draft={draft}
        error={createAction.error}
        limit={limit}
        open={createOpen}
        pending={createAction.pending}
        onDraftChange={setDraft}
        onOpenChange={handleCreateOpenChange}
        onSubmit={handleCreate}
      />

      <ApiKeyRevealDialog keyData={revealedKey} onCopy={handleCopy} onOpenChange={handleRevealOpenChange} />

      {pendingChallenge ? (
        <IdentityVerificationDialog
          defaultMethod={pendingChallenge.defaultMethod}
          description={intl.formatMessage({ id: 'api.keys.verify.description' })}
          error={verificationError}
          methods={pendingChallenge.methods}
          onClearError={clearVerificationError}
          onOpenChange={(open) => {
            if (!open) {
              dismissChallenge();
              setLoadError(intl.formatMessage({ id: 'api.keys.verification.required' }));
            }
          }}
          onSendCode={sendCode}
          onSubmit={handleConfirmVerification}
          open={Boolean(pendingChallenge)}
          pending={submitPending}
          sendPending={sendPending}
          title={intl.formatMessage({ id: 'api.keys.verify.title' })}
        />
      ) : null}
    </div>
  );
};

export default Index;
