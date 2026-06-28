import { type VerificationMethod, type VerificationMethodName } from '@/lib/auth';
import { routePath } from '@/router';
import { isSafeRelativePath } from '@tilty/shared/paths';

const fallbackMethods: VerificationMethodName[] = ['totp', 'passkey', 'sms', 'email'];

export function getMethodOptions(methodsValue: string | null, detailsValue: string | null): VerificationMethod[] {
  const details = parseMethodDetails(detailsValue);
  const detailMap = new Map(details.map((item) => [item.method, item]));
  const methods = methodsValue
    ? getMethods(methodsValue)
    : details.length > 0
      ? details.map((item) => item.method)
      : fallbackMethods;

  return methods.map((method) => detailMap.get(method) ?? { method, label: getMethodLabel(method) });
}

export function getInitialMethod(value: string | null, methods: VerificationMethodName[]) {
  return value && isVerificationMethod(value) && methods.includes(value) ? value : methods[0]!;
}

export function getSafeRedirectPath(value: unknown) {
  if (typeof value !== 'string' || !isSafeRelativePath(value)) {
    return routePath('dashboard');
  }

  return value;
}

function getMethods(value: string | null): VerificationMethodName[] {
  const methods = (value ? value.split(',') : fallbackMethods).filter(isVerificationMethod);

  return methods.length > 0 ? methods : fallbackMethods;
}

function parseMethodDetails(value: string | null): VerificationMethod[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((item) => {
      if (!isMethodDetail(item)) {
        return [];
      }

      return [
        {
          method: item.method,
          label: item.label,
          ...(typeof item.maskedTarget === 'string' ? { maskedTarget: item.maskedTarget } : {}),
        },
      ];
    });
  } catch {
    return [];
  }
}

function isVerificationMethod(value: string): value is VerificationMethodName {
  return value === 'email' || value === 'passkey' || value === 'password' || value === 'sms' || value === 'totp';
}

function getMethodLabel(method: VerificationMethodName) {
  if (method === 'password') {
    return 'Password';
  }

  if (method === 'passkey') {
    return 'Passkey';
  }

  if (method === 'totp') {
    return 'Authenticator app';
  }

  if (method === 'sms') {
    return 'SMS';
  }

  return 'Email';
}

function isMethodDetail(value: unknown): value is VerificationMethod {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<VerificationMethod>;

  return (
    typeof candidate.method === 'string' &&
    isVerificationMethod(candidate.method) &&
    typeof candidate.label === 'string'
  );
}
