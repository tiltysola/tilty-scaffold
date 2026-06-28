import { getSsoCallbackParams, type VerificationMethod } from '@/lib/auth';
import { routePath } from '@/router';
import { isSafeRelativePath } from '@tilty/shared/paths';

export type SsoCallbackStatus = 'bind' | 'invalid' | 'processing';

export interface SsoBindState {
  username: string;
  displayName: string;
  email: string;
  providerName: string;
  redirectPath: string;
  token: string;
}

export type ParsedSsoCallback =
  | {
      type: 'session';
      redirectPath: string;
      token: string;
    }
  | {
      type: 'verification';
      defaultMethod?: string;
      methodDetails?: string;
      methods?: string;
      redirectPath: string;
      token: string;
    }
  | {
      type: 'bind';
      ssoBind: SsoBindState;
    }
  | {
      type: 'profileBind';
      redirectPath: string;
    }
  | {
      type: 'invalid';
    };

export function getPageTitle(status: SsoCallbackStatus) {
  if (status === 'bind') {
    return 'Complete SSO authentication';
  }

  return status === 'invalid' ? 'SSO authentication failed' : 'Completing SSO authentication';
}

export function getPageDescription(status: SsoCallbackStatus, ssoBind: SsoBindState | null) {
  if (status === 'bind' && ssoBind) {
    return `Select the account association method for ${ssoBind.providerName}.`;
  }

  if (status === 'invalid') {
    return 'Return to the login page and start SSO again.';
  }

  return 'Restoring your session.';
}

export function parseSsoCallback(hash: string): ParsedSsoCallback {
  if (!hash) {
    return {
      type: 'invalid',
    };
  }

  const params = getSsoCallbackParams(hash);
  const token = params.get('sso_token');
  const verificationToken = params.get('verification_token');
  const bindToken = params.get('sso_bind_token');

  if (params.get('sso_profile_bind') === 'success') {
    return {
      type: 'profileBind',
      redirectPath: getSafeRedirectPath(params.get('redirect')),
    };
  }

  if (token) {
    return {
      type: 'session',
      redirectPath: getSafeRedirectPath(params.get('redirect')),
      token,
    };
  }

  if (verificationToken) {
    return {
      type: 'verification',
      defaultMethod: params.get('verification_default_method') ?? undefined,
      methodDetails: params.get('verification_method_details') ?? undefined,
      methods: params.get('verification_methods') ?? undefined,
      redirectPath: getSafeRedirectPath(params.get('redirect')),
      token: verificationToken,
    };
  }

  if (bindToken) {
    return {
      type: 'bind',
      ssoBind: {
        username: params.get('sso_username') ?? '',
        displayName: params.get('sso_display_name') ?? '',
        email: params.get('sso_email') ?? '',
        providerName: params.get('sso_provider_name') ?? 'SSO',
        redirectPath: getSafeRedirectPath(params.get('redirect')),
        token: bindToken,
      },
    };
  }

  return {
    type: 'invalid',
  };
}

export function getInitialCallbackHash() {
  return typeof window === 'undefined' ? '' : window.location.hash;
}

export function clearCallbackFragment() {
  window.history.replaceState(null, '', routePath('ssoCallback'));
}

export function getSafeRedirectPath(value: unknown) {
  if (typeof value !== 'string' || !isSafeRelativePath(value)) {
    return routePath('dashboard');
  }

  return value;
}

export function withProfileBindResult(path: string) {
  return `${path.split('#')[0]}#sso_profile_bind=success`;
}

export function createVerificationParams(
  verificationToken: string,
  redirectPath: string,
  defaultMethod?: string,
  methods?: string | VerificationMethod[],
  methodDetails?: string,
) {
  const params = new URLSearchParams({
    redirect: redirectPath,
    token: verificationToken,
  });

  if (defaultMethod) {
    params.set('default_method', defaultMethod);
  }

  if (methods) {
    params.set('methods', Array.isArray(methods) ? methods.map((method) => method.method).join(',') : methods);
  }

  if (Array.isArray(methods)) {
    params.set('method_details', JSON.stringify(methods));
  } else if (methodDetails) {
    params.set('method_details', methodDetails);
  }

  return params.toString();
}
