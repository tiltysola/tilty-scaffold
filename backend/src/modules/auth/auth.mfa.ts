export const mfaMethods = ['passkey', 'totp', 'sms', 'email'] as const;
export type MfaMethod = (typeof mfaMethods)[number];

export const mfaMethodOrder: MfaMethod[] = ['passkey', 'totp', 'sms', 'email'];

const mfaMethodSet = new Set<string>(mfaMethods);

export function isMfaMethod(value: unknown): value is MfaMethod {
  return typeof value === 'string' && mfaMethodSet.has(value);
}

export function parseMfaAllowedMethods(value: string | null | undefined): MfaMethod[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return orderMfaMethods(parsed.filter(isMfaMethod));
  } catch {
    return [];
  }
}

export function orderMfaMethods(methods: MfaMethod[]) {
  const unique = new Set(methods);

  return mfaMethodOrder.filter((method) => unique.has(method));
}

export function getDefaultMfaMethod(methods: MfaMethod[]) {
  return orderMfaMethods(methods)[0];
}
