const authDeviceIdStorageKey = 'tilty-scaffold.auth.device-id';

export function getClientDeviceId() {
  if (typeof window === 'undefined') {
    return undefined;
  }

  try {
    const storage = window.localStorage;
    const existing = storage.getItem(authDeviceIdStorageKey);

    if (typeof existing === 'string' && isValidClientDeviceId(existing)) {
      return existing;
    }

    const nextDeviceId = createClientDeviceId();

    if (!isValidClientDeviceId(nextDeviceId)) {
      return undefined;
    }

    storage.setItem(authDeviceIdStorageKey, nextDeviceId);

    return nextDeviceId;
  } catch {
    return undefined;
  }
}

function createClientDeviceId() {
  const webCrypto = globalThis.crypto;

  if (webCrypto && typeof webCrypto.randomUUID === 'function') {
    const randomId = webCrypto.randomUUID();

    if (typeof randomId === 'string') {
      return randomId;
    }
  }

  if (webCrypto && typeof webCrypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);

    webCrypto.getRandomValues(bytes);

    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  return `${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 18)}`;
}

function isValidClientDeviceId(value: string) {
  return /^[A-Za-z0-9._:-]{1,128}$/.test(value);
}
