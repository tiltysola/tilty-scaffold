import { type VerificationMethod, type VerificationMethodName } from '@/lib/auth';
import { routePath } from '@/router';
import { AuthMfaMethod, authVerificationMethodValues } from '@tilty/shared/auth';
import { isSafeRelativePath } from '@tilty/shared/paths';

const fallbackMethods: VerificationMethodName[] = [
  AuthMfaMethod.Totp,
  AuthMfaMethod.Passkey,
  AuthMfaMethod.Sms,
  AuthMfaMethod.Email,
];
const verificationMethodSet = new Set<string>(authVerificationMethodValues);

export function getMethodOptions(methodsValue: string | null, detailsValue: string | null): VerificationMethod[] {
  const details = parseMethodDetails(detailsValue);
  const detailMap = new Map(details.map((item) => [item.method, item]));
  const methods = methodsValue
    ? getMethods(methodsValue)
    : details.length > 0
      ? details.map((item) => item.method)
      : fallbackMethods;

  return methods.map((method) => ({
    ...detailMap.get(method),
    method,
  }));
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
          ...(typeof item.maskedTarget === 'string' ? { maskedTarget: item.maskedTarget } : {}),
        },
      ];
    });
  } catch {
    return [];
  }
}

function isVerificationMethod(value: string): value is VerificationMethodName {
  return verificationMethodSet.has(value);
}

function isMethodDetail(value: unknown): value is VerificationMethod {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<VerificationMethod>;

  return typeof candidate.method === 'string' && isVerificationMethod(candidate.method);
}
