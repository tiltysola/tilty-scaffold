import { type VerificationMethod } from '@/lib/auth';
import { routePath } from '@/router';
import { isSafeRelativePath } from '@tilty/shared/paths';

export function getRedirectPath(state: unknown) {
  if (!state || typeof state !== 'object') {
    return routePath('dashboard');
  }

  const from = (state as { from?: unknown }).from;

  return getSafeRedirectPath(from);
}

function getSafeRedirectPath(value: unknown) {
  if (typeof value !== 'string' || !isSafeRelativePath(value)) {
    return routePath('dashboard');
  }

  return value;
}

export function createVerificationParams(
  verificationToken: string,
  redirectPath: string,
  defaultMethod: string,
  methods: VerificationMethod[],
) {
  return new URLSearchParams({
    default_method: defaultMethod,
    method_details: JSON.stringify(methods),
    methods: methods.map((method) => method.method).join(','),
    redirect: redirectPath,
    token: verificationToken,
  }).toString();
}
