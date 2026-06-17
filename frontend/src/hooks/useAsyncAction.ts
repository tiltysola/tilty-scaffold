import { useCallback, useState } from 'react';

import { getApiErrorMessage } from '@/lib/api';

type ErrorMessageResolver = (error: unknown, fallback: string) => string;

interface RunOptions {
  getErrorMessage?: ErrorMessageResolver;
}

export function useAsyncAction(defaultGetErrorMessage: ErrorMessageResolver = getApiErrorMessage) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const run = useCallback(
    async <T>(action: () => Promise<T>, fallbackError: string, options: RunOptions = {}) => {
      setError(null);
      setPending(true);

      try {
        return await action();
      } catch (error) {
        setError((options.getErrorMessage ?? defaultGetErrorMessage)(error, fallbackError));
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [defaultGetErrorMessage],
  );

  return {
    clearError,
    error,
    pending,
    run,
    setError,
    setPending,
  };
}
