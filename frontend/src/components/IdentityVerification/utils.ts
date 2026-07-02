import { type VerificationMethod, type VerificationMethodName } from '@/lib/auth';
import { type IdentityVerificationContext } from '@/lib/verification';

export function getInitialMethod(defaultMethod: VerificationMethodName, methods: VerificationMethod[]) {
  return methods.some((method) => method.method === defaultMethod) ? defaultMethod : methods[0]!.method;
}

export function getInitialVerificationContext(
  defaultMethod: VerificationMethodName,
  methods: VerificationMethod[],
): IdentityVerificationContext {
  return {
    method: getInitialMethod(defaultMethod, methods),
    usingRecoveryCode: false,
  };
}

export function getFormKey(defaultMethod: VerificationMethodName, methods: VerificationMethod[]) {
  return [defaultMethod, ...methods.map((method) => `${method.method}:${method.maskedTarget ?? ''}`)].join('|');
}
