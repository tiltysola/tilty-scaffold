import { ReadStream } from 'fs';
import { describe, expect, it } from 'vitest';

import { systemPermissionKeys, systemRoleKeys } from '@tilty/shared/access-control';
import { apiKeyActiveLimitPerUser, apiKeyStatusValues } from '@tilty/shared/api-keys';
import {
  authMfaMethodValues,
  authSelectableVerificationPurposeValues,
  authSessionDeviceTypeValues,
  authVerificationCodeMethodValues,
  authVerificationMethodValues,
  AuthVerificationPurpose,
  authVerificationPurposeValues,
} from '@tilty/shared/auth';
import { localeRequestHeader, supportedLocales } from '@tilty/shared/i18n';
import {
  setupCacheStoreValues,
  setupEmailVerificationServiceValues,
  setupEnvironmentStepValues,
  setupFileStorageDriverValues,
  setupLogTargetValues,
  setupSmsPhoneCountryCodeValues,
  setupSmsVerificationServiceValues,
  setupSsoProtocolValues,
} from '@tilty/shared/setup';

import { setupEnvironmentKeys } from '../src/config/setup-environment';
import { backendMessages } from '../src/i18n';
import { createDocsModule } from '../src/modules/docs';
import { ReadinessCheckStatus, readinessCheckStatusValues } from '../src/modules/health';
import { createTestContext, getTestRouteHandler, runMiddleware } from './support/http';

interface OpenApiDocument {
  components: {
    parameters: Record<string, OpenApiParameter | undefined>;
    responses: Record<string, OpenApiResponse | undefined>;
    securitySchemes: Record<string, OpenApiSecurityScheme | undefined>;
    schemas: Record<string, OpenApiSchema | undefined>;
  };
  info: {
    title: string;
    version: string;
  };
  openapi: string;
  paths: Record<string, OpenApiPathItem | undefined>;
  servers: Array<{
    description: string;
    url: string;
  }>;
}

type OpenApiMethod = 'delete' | 'get' | 'patch' | 'post' | 'put';

interface OpenApiPathItem {
  delete?: OpenApiOperation;
  get?: OpenApiOperation;
  parameters?: unknown[];
  patch?: OpenApiOperation;
  post?: OpenApiOperation;
  put?: OpenApiOperation;
}

interface OpenApiOperation {
  description?: string;
  responses: Record<string, unknown>;
  security?: unknown[];
  'x-api-key-deny-reason'?: string;
  'x-api-key-disabled'?: boolean;
}

interface OpenApiParameter {
  in: string;
  name: string;
  required: boolean;
  schema: Record<string, unknown>;
}

interface OpenApiResponse {
  description?: string;
  content: {
    'application/json': {
      examples?: Record<string, { value: { error: string; message?: string } }>;
    };
  };
}

interface OpenApiSecurityScheme {
  bearerFormat?: string;
  in?: string;
  name?: string;
  scheme?: string;
  type: string;
}

interface OpenApiSchema {
  allOf?: OpenApiSchema[];
  additionalProperties?: OpenApiSchema;
  const?: unknown;
  enum?: readonly string[];
  items?: OpenApiSchema;
  properties?: Record<string, OpenApiSchema | undefined>;
  propertyNames?: {
    enum?: string[];
  };
  required?: string[];
}

interface OpenApiSchemaResponse {
  content: {
    'application/json': {
      schema: unknown;
    };
  };
}

const openApiMethods = ['delete', 'get', 'patch', 'post', 'put'] as const satisfies readonly OpenApiMethod[];

describe('docs API', () => {
  const routes = createDocsModule().routes;

  it('returns the OpenAPI document', async () => {
    const context = await runMiddleware(getTestRouteHandler(routes, 'get', '/openapi.json'), createTestContext());
    const body = context.body as OpenApiDocument;

    expect(body.openapi).toBe('3.1.0');
    expect(body.info).toEqual({
      title: 'Tilty Scaffold API',
      description:
        'Backend API contract for Tilty Scaffold. The public frontend landing page is available at /, the authenticated console starts at /dashboard, and Swagger UI is served from /api/docs.',
      version: '0.1.14',
    });
    expect(body.servers[0]).toEqual({
      url: '/',
      description: 'Current origin',
    });
    expect(body.paths['/api/setup/defaults']).toBeDefined();
    expect(body.paths['/api/setup/test/sms']).toBeDefined();
    expect(body.paths['/api/setup/status']).toBeUndefined();
    expect(body.paths['/api/auth/login']).toBeDefined();
    expect(body.paths['/api/auth/refresh']).toBeDefined();
    expect(body.paths['/api/auth/register/email-verification']).toBeDefined();
    expect(body.paths['/api/auth/password-reset']).toBeDefined();
    expect(body.paths['/api/auth/password-reset/email-verification']).toBeDefined();
    expect(body.paths['/api/auth/password']).toBeDefined();
    expect(body.paths['/api/users/me']).toBeDefined();
    expect(body.paths['/api/users/me/email-verification']).toBeDefined();
    expect(body.paths['/api/users/me/email-verification/confirm']).toBeDefined();
    expect(body.paths['/api/users/me/phone-verification']).toBeDefined();
    expect(body.paths['/api/users/me/phone-verification/confirm']).toBeDefined();
    expect(body.paths['/api/users/me/avatar']).toBeDefined();
    expect(body.paths['/api/users/me/profile-banner']).toBeDefined();
    expect(body.paths['/api/users/me/profile-background']).toBeDefined();
    expect(body.paths['/api/auth/me']).toBeUndefined();
    expect(body.paths['/api/auth/me/password']).toBeUndefined();
    expect(body.paths['/api/auth/avatar']).toBeUndefined();
    expect(body.paths['/api/auth/profile-banner']).toBeUndefined();
    expect(body.paths['/api/auth/profile-background']).toBeUndefined();
    expect(body.paths['/api/auth/sso/config']).toBeDefined();
    expect(body.paths['/api/auth/sso/start']).toBeDefined();
    expect(body.paths['/api/auth/sso/callback']).toBeDefined();
    expect(body.paths['/api/auth/sso/session']).toBeDefined();
    expect(body.paths['/api/auth/sso/account']).toBeDefined();
    expect(body.paths['/api/auth/sso/bind']).toBeDefined();
    expect(body.paths['/api/auth/logout']).toBeDefined();
    expect(body.paths['/api/api-keys']).toBeDefined();
    expect(body.paths['/api/api-keys/{id}']).toBeUndefined();
    expect(body.paths['/api/api-keys/{id}/audit']).toBeUndefined();
    expect(body.paths['/api/api-keys/{id}/disable']).toBeDefined();
    expect(body.paths['/api/api-keys/{id}/enable']).toBeDefined();
    expect(body.paths['/api/api-keys/{id}/revoke']).toBeDefined();
    expect(body.paths['/api/api-keys/{id}/rotate']).toBeUndefined();
    expect(body.paths['/api/api-keys/{id}/usage']).toBeUndefined();
    expect(body.paths['/api/admin/api-keys']).toBeDefined();
    expect(body.paths['/api/admin/api-keys/{id}/revoke']).toBeDefined();
    expect(body.paths['/api/admin/users/']).toBeDefined();
    expect(body.paths['/api/admin/users/{id}']).toBeDefined();
    expect(body.paths['/api/admin/users/{id}/roles']).toBeDefined();
    expect(body.paths['/api/admin/users/{id}/details']).toBeDefined();
    expect(body.paths['/api/admin/users/{id}/mfa']).toBeDefined();
    expect(body.paths['/api/admin/users/{id}/totp/disable']).toBeDefined();
    expect(body.paths['/api/admin/users/{id}/passkeys/{passkeyId}']).toBeDefined();
    expect(body.paths['/api/admin/users/{id}/devices']).toBeDefined();
    expect(body.paths['/api/admin/users/{id}/devices/{sessionId}']).toBeDefined();
    expect(body.paths['/api/admin/users/{id}/sso-identities']).toBeDefined();
    expect(body.paths['/api/admin/users/{id}/sso-identities/{providerId}']).toBeDefined();
    expect(body.paths['/api/admin/users/{id}/avatar']).toBeDefined();
    expect(body.paths['/api/admin/users/{id}/profile-banner']).toBeDefined();
    expect(body.paths['/api/admin/users/{id}/profile-background']).toBeDefined();
    expect(body.paths['/api/users/']).toBeUndefined();
    expect(body.paths['/api/users/{id}']).toBeUndefined();
    expect(body.paths['/api/users/{id}/roles']).toBeUndefined();
    expect(body.paths['/api/users/{id}/details']).toBeUndefined();
    expect(body.paths['/api/users/{id}/mfa']).toBeUndefined();
    expect(body.paths['/api/users/{id}/totp/disable']).toBeUndefined();
    expect(body.paths['/api/users/{id}/passkeys/{passkeyId}']).toBeUndefined();
    expect(body.paths['/api/users/{id}/devices']).toBeUndefined();
    expect(body.paths['/api/users/{id}/devices/{sessionId}']).toBeUndefined();
    expect(body.paths['/api/users/{id}/sso-identities']).toBeUndefined();
    expect(body.paths['/api/users/{id}/sso-identities/{providerId}']).toBeUndefined();
    expect(body.paths['/api/users/{id}/avatar']).toBeUndefined();
    expect(body.paths['/api/users/{id}/profile-banner']).toBeUndefined();
    expect(body.paths['/api/users/{id}/profile-background']).toBeUndefined();
    expect(body.paths['/api/users/profile-options/genders']).toBeDefined();
    expect(body.paths['/api/users/profile-options/locations/countries']).toBeDefined();
    expect(body.paths['/api/users/profile-options/locations/regions']).toBeDefined();
    expect(body.paths['/api/users/profile-options/locations/cities']).toBeDefined();
    expect(body.paths['/api/profile-options/genders']).toBeUndefined();
    expect(body.paths['/api/profile-options/locations/countries']).toBeUndefined();
    expect(body.paths['/api/profile-options/locations/regions']).toBeUndefined();
    expect(body.paths['/api/profile-options/locations/cities']).toBeUndefined();
    expect(body.paths['/api/admin/system-settings/']).toBeDefined();
    expect(body.paths['/api/health']).toBeDefined();
    expect(body.paths['/api/health/ready']).toBeDefined();
    expect(body.paths['/api/openapi.json']).toBeDefined();
    expect(body.paths['/api/docs']).toBeDefined();
    expect(body.paths['/api/auth/login']?.parameters).toEqual(localeRequestParameterRefs);
    expect(body.paths['/api/admin/users/{id}/roles']?.parameters).toEqual(localeRequestParameterRefs);
    expect(body.components.parameters.LocaleHeader).toMatchObject({
      name: localeRequestHeader,
      in: 'header',
      required: false,
      schema: {
        enum: supportedLocales,
      },
    });
    expect(body.components.parameters.AcceptLanguageHeader).toMatchObject({
      name: 'Accept-Language',
      in: 'header',
      required: false,
    });
    expect(body.components.securitySchemes.apiKeyAuth).toMatchObject({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'API Key',
    });

    expectResponseRefs(body, '/api/setup/defaults', 'get', {
      '403': 'SetupLocked',
    });

    for (const path of setupUnsafePaths) {
      expectResponseRefs(body, path, 'post', {
        '403': 'SetupForbidden',
      });
    }

    for (const [path, method] of csrfProtectedOperations) {
      expectResponseRefs(body, path, method, {
        '403': 'CsrfForbidden',
      });
    }

    expectResponseRefs(body, '/api/auth/register', 'post', {
      '400': 'ValidationError',
      '403': 'CsrfForbidden',
      '409': 'AccountIdentifierConflict',
      '429': 'RateLimited',
    });
    expectResponseRefs(body, '/api/auth/register/email-verification', 'post', {
      '400': 'ValidationError',
      '403': 'CsrfForbidden',
      '404': 'EmailVerificationDisabled',
      '409': 'AccountIdentifierConflict',
      '429': 'RateLimited',
    });
    expectResponseRefs(body, '/api/auth/login', 'post', {
      '400': 'ValidationError',
      '401': 'InvalidCredentials',
      '403': 'CsrfForbidden',
      '429': 'RateLimited',
    });
    expectSuccessSchemaRef(body, '/api/auth/login', 'post', 'LoginResponse');
    expectResponseRefs(body, '/api/auth/password-reset', 'post', {
      '400': 'ValidationError',
      '403': 'CsrfForbidden',
      '404': 'EmailVerificationDisabled',
      '429': 'RateLimited',
    });
    expectResponseRefs(body, '/api/users/me/email-verification', 'post', {
      '401': 'AuthRequired',
      '403': 'CsrfOrVerificationRequired',
      '404': 'EmailVerificationDisabled',
      '409': 'EmailAlreadyVerified',
      '429': 'RateLimited',
    });
    expectResponseRefs(body, '/api/users/me/email-verification/confirm', 'post', {
      '400': 'ValidationError',
      '401': 'AuthRequired',
      '403': 'CsrfOrVerificationRequired',
      '404': 'EmailVerificationDisabled',
      '429': 'RateLimited',
    });
    expectResponseRefs(body, '/api/users/me/phone-verification', 'post', {
      '400': 'ValidationError',
      '401': 'AuthRequired',
      '403': 'CsrfOrVerificationRequired',
      '404': 'SmsVerificationDisabled',
      '409': 'PhoneAlreadyVerified',
      '429': 'RateLimited',
    });
    expectResponseRefs(body, '/api/users/me/phone-verification/confirm', 'post', {
      '400': 'ValidationError',
      '401': 'AuthRequired',
      '403': 'CsrfOrVerificationRequired',
      '404': 'SmsVerificationDisabled',
      '409': 'PhoneIdentifierConflict',
      '429': 'RateLimited',
    });
    expectResponseRefs(body, '/api/users/me', 'get', {
      '401': 'AuthRequired',
    });
    expectResponseRefs(body, '/api/users/me', 'patch', {
      '400': 'ValidationError',
      '401': 'AuthRequired',
      '403': 'CsrfOrVerificationRequired',
      '429': 'RateLimited',
    });
    expectResponseRefs(body, '/api/auth/password', 'patch', {
      '400': 'ValidationError',
      '401': 'ChangePasswordUnauthorized',
      '403': 'CsrfOrVerificationRequired',
      '429': 'RateLimited',
    });
    expectSuccessSchemaRef(body, '/api/auth/password', 'patch', 'PasswordChangeResponse');
    expectResponseRefs(body, '/api/auth/totp/setup', 'post', {
      '401': 'AuthRequired',
      '403': 'CsrfOrVerificationRequired',
      '429': 'RateLimited',
    });
    expectResponseRefs(body, '/api/auth/totp/enable', 'post', {
      '400': 'ValidationError',
      '401': 'AuthRequired',
      '403': 'CsrfOrVerificationRequired',
      '429': 'RateLimited',
    });
    expectResponseRefs(body, '/api/auth/totp/disable', 'post', {
      '401': 'AuthRequired',
      '403': 'CsrfOrVerificationRequired',
      '429': 'RateLimited',
    });
    expectResponseRefs(body, '/api/auth/totp/recovery-codes', 'post', {
      '401': 'AuthRequired',
      '403': 'CsrfOrVerificationRequired',
      '429': 'RateLimited',
    });
    expectResponseRefs(body, '/api/auth/mfa', 'patch', {
      '400': 'ValidationError',
      '401': 'AuthRequired',
      '403': 'CsrfOrVerificationRequired',
      '429': 'RateLimited',
    });
    expectResponseRefs(body, '/api/auth/passkeys', 'post', {
      '400': 'ValidationError',
      '401': 'AuthRequired',
      '403': 'CsrfOrVerificationRequired',
      '429': 'RateLimited',
    });
    expectResponseRefs(body, '/api/auth/passkeys/registration-options', 'post', {
      '401': 'AuthRequired',
      '403': 'CsrfOrVerificationRequired',
      '429': 'RateLimited',
    });
    expectResponseRefs(body, '/api/auth/passkeys/{passkeyId}', 'delete', {
      '401': 'AuthRequired',
      '403': 'CsrfOrVerificationRequired',
      '429': 'RateLimited',
    });
    expectResponseRefs(body, '/api/auth/refresh', 'post', {
      '401': 'AuthRequired',
      '403': 'CsrfForbidden',
    });
    expectResponseRefs(body, '/api/users/me/avatar', 'post', {
      '400': 'ValidationError',
      '401': 'AuthRequired',
      '403': 'CsrfForbidden',
      '429': 'RateLimited',
    });
    expectResponseRefs(body, '/api/users/me/avatar', 'delete', {
      '401': 'AuthRequired',
      '403': 'CsrfForbidden',
      '429': 'RateLimited',
    });
    expectResponseRefs(body, '/api/users/me/profile-banner', 'post', {
      '400': 'ValidationError',
      '401': 'AuthRequired',
      '403': 'CsrfForbidden',
      '429': 'RateLimited',
    });
    expectResponseRefs(body, '/api/users/me/profile-banner', 'delete', {
      '401': 'AuthRequired',
      '403': 'CsrfForbidden',
      '429': 'RateLimited',
    });
    expectResponseRefs(body, '/api/users/me/profile-background', 'post', {
      '400': 'ValidationError',
      '401': 'AuthRequired',
      '403': 'CsrfForbidden',
      '429': 'RateLimited',
    });
    expectResponseRefs(body, '/api/users/me/profile-background', 'delete', {
      '401': 'AuthRequired',
      '403': 'CsrfForbidden',
      '429': 'RateLimited',
    });
    expectResponseRefs(body, '/api/auth/sso/start', 'get', {
      '400': 'ValidationError',
      '404': 'SsoDisabled',
    });
    expectResponseRefs(body, '/api/auth/sso/bind/start', 'get', {
      '400': 'ValidationError',
      '401': 'AuthRequired',
      '403': 'SsoBindVerificationRequired',
      '404': 'SsoDisabled',
    });
    expectResponseRefs(body, '/api/auth/sso/callback', 'get', {
      '400': 'ValidationError',
      '401': 'SsoFailed',
      '404': 'SsoDisabled',
    });
    expectResponseRefs(body, '/api/auth/sso/session', 'post', {
      '400': 'ValidationError',
      '401': 'SsoFailed',
      '403': 'CsrfForbidden',
      '404': 'SsoDisabled',
    });
    expectSuccessSchemaRef(body, '/api/auth/sso/session', 'post', 'AuthSessionResponse');
    expectResponseRefs(body, '/api/auth/sso/account', 'post', {
      '400': 'ValidationError',
      '401': 'SsoFailed',
      '403': 'CsrfForbidden',
      '404': 'SsoDisabled',
      '409': 'SsoBindConflict',
      '429': 'RateLimited',
    });
    expectResponseRefs(body, '/api/auth/sso/bind', 'post', {
      '400': 'ValidationError',
      '401': 'SsoBindUnauthorized',
      '403': 'CsrfForbidden',
      '404': 'SsoDisabled',
      '409': 'SsoBindConflict',
      '429': 'RateLimited',
    });
    expectSuccessSchemaRef(body, '/api/auth/sso/bind', 'post', 'LoginResponse');
    expectResponseRefs(body, '/api/api-keys', 'get', {
      '401': 'AuthRequired',
      '403': 'ApiKeyManagementAccessRequired',
    });
    expectResponseRefs(body, '/api/api-keys', 'post', {
      '400': 'ValidationError',
      '401': 'AuthRequired',
      '403': 'CsrfOrApiKeyManagementAccessRequired',
      '409': 'Conflict',
    });
    expectCreatedSchemaRef(body, '/api/api-keys', 'post', 'ApiKeyRevealResponse');
    for (const path of ['/api/api-keys/{id}/disable', '/api/api-keys/{id}/enable', '/api/api-keys/{id}/revoke']) {
      expectResponseRefs(body, path, 'post', {
        '400': 'ValidationError',
        '401': 'AuthRequired',
        '403': 'CsrfOrApiKeyManagementAccessRequired',
        '404': 'NotFound',
      });
    }
    expectSuccessSchemaRef(body, '/api/api-keys/{id}/disable', 'post', 'ApiKeySummaryResponse');
    expectSuccessSchemaRef(body, '/api/api-keys/{id}/enable', 'post', 'ApiKeySummaryResponse');
    expectSuccessSchemaRef(body, '/api/api-keys/{id}/revoke', 'post', 'ApiKeySummaryResponse');
    expectResponseRefs(body, '/api/admin/api-keys', 'get', {
      '401': 'AuthRequired',
      '403': 'AdminApiKeyManagementAccessRequired',
    });
    expectResponseRefs(body, '/api/admin/api-keys/{id}/revoke', 'post', {
      '400': 'ValidationError',
      '401': 'AuthRequired',
      '403': 'CsrfOrAdminApiKeyManagementAccessRequired',
      '404': 'NotFound',
    });
    expectResponseRefs(body, '/api/admin/users/{id}/roles', 'put', {
      '403': 'CsrfOrUserManagementAccessRequired',
    });
    expectResponseRefs(body, '/api/admin/users/{id}', 'put', {
      '400': 'ValidationError',
      '401': 'AuthRequired',
      '403': 'CsrfOrUserManagementAccessRequired',
    });
    expectSuccessSchemaRef(body, '/api/admin/users/{id}/details', 'get', 'ManagedUserDetailsResponse');
    expectSuccessSchemaRef(body, '/api/admin/users/{id}/mfa', 'patch', 'ManagedUserSecurityResponse');
    expectSuccessSchemaRef(body, '/api/admin/users/{id}/totp/disable', 'post', 'ManagedUserSecurityResponse');
    expectSuccessSchemaRef(body, '/api/admin/users/{id}/passkeys/{passkeyId}', 'delete', 'ManagedUserSecurityResponse');
    expectSuccessSchemaRef(body, '/api/users/profile-options/genders', 'get', 'ProfileOptionsResponse');
    expectSuccessSchemaRef(body, '/api/users/profile-options/locations/countries', 'get', 'ProfileOptionsResponse');
    expectSuccessSchemaRef(body, '/api/users/profile-options/locations/regions', 'get', 'ProfileOptionsResponse');
    expectSuccessSchemaRef(body, '/api/users/profile-options/locations/cities', 'get', 'ProfileOptionsResponse');
    expectResponseRefs(body, '/api/users/profile-options/genders', 'get', {
      '401': 'AuthRequired',
    });
    expectResponseRefs(body, '/api/admin/system-settings/', 'get', {
      '401': 'AuthRequired',
      '403': 'SystemSettingsAccessRequired',
    });
    expectResponseRefs(body, '/api/admin/system-settings/', 'put', {
      '400': 'ValidationError',
      '401': 'AuthRequired',
      '403': 'CsrfOrSystemSettingsAccessRequired',
    });

    const ssoBindUnauthorized = body.components.responses.SsoBindUnauthorized;
    const ssoBindStart = body.paths['/api/auth/sso/bind/start']?.get;
    const ssoBindVerificationRequired = body.components.responses.SsoBindVerificationRequired;
    const apiKeyList = body.paths['/api/api-keys']?.get;
    const apiKeyCreate = body.paths['/api/api-keys']?.post;
    const profileEmailVerification = body.paths['/api/users/me/email-verification']?.post;
    const profileEmailVerificationConfirm = body.paths['/api/users/me/email-verification/confirm']?.post;
    const profilePhoneVerification = body.paths['/api/users/me/phone-verification']?.post;
    const profilePhoneVerificationConfirm = body.paths['/api/users/me/phone-verification/confirm']?.post;
    const systemSettingsGet = body.paths['/api/admin/system-settings/']?.get;
    const userList = body.paths['/api/admin/users/']?.get;
    const updateUser = body.paths['/api/admin/users/{id}']?.put;
    const verificationChallengeCreate = body.components.schemas.VerificationChallengeCreateRequest;

    expect(ssoBindUnauthorized?.content['application/json'].examples).toMatchObject({
      invalidCredentials: {
        value: {
          error: 'AUTH_INVALID_CREDENTIALS',
        },
      },
      invalidToken: {
        value: {
          error: 'AUTH_INVALID_TOKEN',
        },
      },
      expiredToken: {
        value: {
          error: 'AUTH_TOKEN_EXPIRED',
        },
      },
    });
    expect(ssoBindStart?.description).toContain(AuthVerificationPurpose.ManageSso);
    expect(ssoBindVerificationRequired?.description).toContain(AuthVerificationPurpose.ManageSso);
    expect(userList?.description).toContain(AuthVerificationPurpose.UserManagement);
    expect(updateUser?.description).toContain(AuthVerificationPurpose.UserManagement);
    expect(userList?.security).toEqual([{ accessCookieAuth: [] }]);
    expect(updateUser?.security).toEqual([{ accessCookieAuth: [] }]);
    expect(apiKeyList?.security).toEqual([{ accessCookieAuth: [] }]);
    expect(apiKeyCreate?.security).toEqual([{ accessCookieAuth: [] }]);
    expect(profileEmailVerification?.security).toEqual([{ accessCookieAuth: [] }]);
    expect(profileEmailVerificationConfirm?.security).toEqual([{ accessCookieAuth: [] }]);
    expect(profilePhoneVerification?.security).toEqual([{ accessCookieAuth: [] }]);
    expect(profilePhoneVerificationConfirm?.security).toEqual([{ accessCookieAuth: [] }]);
    expect(systemSettingsGet?.security).toEqual([{ accessCookieAuth: [] }]);

    for (const operation of [
      apiKeyList,
      apiKeyCreate,
      profileEmailVerification,
      profileEmailVerificationConfirm,
      profilePhoneVerification,
      profilePhoneVerificationConfirm,
      systemSettingsGet,
      userList,
      updateUser,
    ]) {
      expect(operation?.['x-api-key-disabled']).toBe(true);
      expect(operation?.['x-api-key-deny-reason']).toBe('verified-session-required');
    }

    for (const [path, method] of currentUserApiKeyOperations) {
      const operation = body.paths[path]?.[method];

      expect(operation?.security, `${method.toUpperCase()} ${path}`).toEqual([
        {
          accessCookieAuth: [],
        },
        {
          apiKeyAuth: [],
        },
      ]);
      expect(operation?.['x-api-key-disabled'], `${method.toUpperCase()} ${path}`).toBeUndefined();
      expect(operation?.['x-api-key-deny-reason'], `${method.toUpperCase()} ${path}`).toBeUndefined();
    }

    for (const [path, pathItem] of Object.entries(body.paths)) {
      if (!path.startsWith('/api/admin/')) {
        continue;
      }

      for (const method of openApiMethods) {
        const operation = pathItem?.[method];

        if (!operation) {
          continue;
        }

        expect(operation.security, `${method.toUpperCase()} ${path}`).not.toContainEqual({ apiKeyAuth: [] });
        expect(operation['x-api-key-disabled'], `${method.toUpperCase()} ${path}`).toBe(true);
        expect(operation['x-api-key-deny-reason'], `${method.toUpperCase()} ${path}`).toBe('verified-session-required');
      }
    }

    expect(verificationChallengeCreate?.properties?.purpose?.description).toContain(AuthVerificationPurpose.ManageSso);
    expect(verificationChallengeCreate?.properties?.purpose?.description).toContain(
      AuthVerificationPurpose.ManageApiKey,
    );

    const setupEnvironment = body.components.schemas.SetupEnvironment;
    const setupDefaults = body.components.schemas.SetupDefaults;

    expect(setupEnvironment).toBeDefined();
    expect(setupDefaults).toBeDefined();
    expect(setupEnvironment?.required).toEqual(setupEnvironmentKeys);
    expect(setupEnvironment?.required).not.toContain('SETUP_LOCKED');
    expect(setupEnvironment?.propertyNames?.enum).toEqual(setupEnvironment?.required);
    expect(setupDefaults?.required).toEqual(['environment', 'environmentFileLoaded']);
    expect(body.components.schemas.SetupEnvironmentRequest?.properties?.stepId?.enum).toEqual(
      setupEnvironmentStepValues,
    );
    expect(body.components.schemas.AuthUser?.properties?.roles?.items?.enum).toEqual(systemRoleKeys);
    expect(body.components.schemas.AuthUser?.properties?.permissions?.items?.enum).toEqual(systemPermissionKeys);
    expect(body.components.schemas.ApiKeyStatus?.enum).toEqual(apiKeyStatusValues);
    expect(body.components.schemas.ApiKeyListResponse?.allOf?.[1]?.properties?.data?.properties?.limit?.const).toBe(
      apiKeyActiveLimitPerUser,
    );
    expect(body.components.schemas.MfaMethod?.enum).toEqual(authMfaMethodValues);
    expect(body.components.schemas.VerificationMethodName?.enum).toEqual(authVerificationMethodValues);
    expect(body.components.schemas.VerificationPurpose?.enum).toEqual(authVerificationPurposeValues);
    expect(verificationChallengeCreate?.properties?.purpose?.enum).toEqual(authSelectableVerificationPurposeValues);
    expect(body.components.schemas.VerificationCodeSendRequest?.properties?.method?.enum).toEqual(
      authVerificationCodeMethodValues,
    );
    expect(body.components.schemas.AuthDeviceSession?.properties?.deviceType?.enum).toEqual(
      authSessionDeviceTypeValues,
    );
    expectSetupConnectionEnum(body, 'SetupCacheConnectionTestResponse', 'store', setupCacheStoreValues);
    expectSetupConnectionEnum(body, 'SetupFileStorageConnectionTestResponse', 'driver', setupFileStorageDriverValues);
    expectSetupConnectionEnum(body, 'SetupLoggingConnectionTestResponse', 'target', setupLogTargetValues);
    expectSetupConnectionEnum(body, 'SetupEmailConnectionTestResponse', 'service', setupEmailVerificationServiceValues);
    expectSetupConnectionEnum(body, 'SetupSmsConnectionTestResponse', 'service', setupSmsVerificationServiceValues);
    expect(
      body.components.schemas.SetupSmsConnectionTestResponse?.allOf?.[1]?.properties?.data?.properties
        ?.profileCountryCodes?.items?.enum,
    ).toEqual(setupSmsPhoneCountryCodeValues);
    expect(body.components.schemas.AuthConfig?.properties?.phoneCountryCodes?.items?.enum).toEqual(
      setupSmsPhoneCountryCodeValues,
    );
    expect(body.components.schemas.SsoProvider?.properties?.protocol?.enum).toEqual(setupSsoProtocolValues);
    expect(body.components.schemas.Health?.properties?.status?.const).toBe(ReadinessCheckStatus.Ok);
    expect(body.components.schemas.Readiness?.properties?.checks?.additionalProperties?.enum).toEqual(
      readinessCheckStatusValues,
    );
    expect(body.components.schemas.Readiness?.properties?.status?.const).toBe(ReadinessCheckStatus.Ok);
  });

  it('keeps OpenAPI error examples aligned with backend catalog messages', async () => {
    const context = await runMiddleware(getTestRouteHandler(routes, 'get', '/openapi.json'), createTestContext());
    const body = context.body as OpenApiDocument;
    const mismatchedExamples: string[] = [];

    for (const [responseName, response] of Object.entries(body.components.responses)) {
      const examples = response?.content['application/json'].examples ?? {};

      for (const [exampleName, example] of Object.entries(examples)) {
        const catalogMessage =
          backendMessages['en-US'][`error.${example.value.error}` as keyof (typeof backendMessages)['en-US']];

        if (catalogMessage && example.value.message !== catalogMessage) {
          mismatchedExamples.push(`${responseName}.${exampleName}: ${example.value.error}`);
        }
      }
    }

    expect(mismatchedExamples).toEqual([]);
  });

  it('returns Swagger UI HTML', async () => {
    const context = await runMiddleware(getTestRouteHandler(routes, 'get', '/docs'), createTestContext());

    expect(context.type).toBe('html');
    expect(context.body).toContain('swagger-ui-bundle.js');
    expect(context.body).toContain('swagger-initializer.js');
    expect(context.body).not.toContain('SwaggerUIBundle({');
  });

  it('returns Swagger UI assets', async () => {
    const context = await runMiddleware(
      getTestRouteHandler(routes, 'get', '/docs/:asset'),
      createTestContext(undefined, {}, { asset: 'swagger-ui.css' }),
    );

    expect(context.type).toContain('text/css');
    expect(context.body).toBeInstanceOf(ReadStream);
  });

  it('returns the Swagger UI initializer asset', async () => {
    const context = await runMiddleware(
      getTestRouteHandler(routes, 'get', '/docs/:asset'),
      createTestContext(undefined, {}, { asset: 'swagger-initializer.js' }),
    );

    expect(context.type).toContain('application/javascript');
    expect(context.body).toContain("url: '/api/openapi.json'");
  });
});

const setupUnsafePaths = [
  '/api/setup/validate',
  '/api/setup/validate/environment',
  '/api/setup/test/database',
  '/api/setup/test/cache',
  '/api/setup/test/file-storage',
  '/api/setup/test/logging',
  '/api/setup/test/email',
  '/api/setup/test/sms',
  '/api/setup/test/sso',
  '/api/setup/complete',
] as const;

const csrfProtectedOperations = [
  ['/api/auth/register', 'post'],
  ['/api/auth/register/email-verification', 'post'],
  ['/api/auth/password-reset/email-verification', 'post'],
  ['/api/auth/password-reset', 'post'],
  ['/api/auth/login', 'post'],
  ['/api/auth/refresh', 'post'],
  ['/api/auth/logout', 'post'],
  ['/api/users/me/avatar', 'post'],
  ['/api/users/me/avatar', 'delete'],
  ['/api/users/me/profile-banner', 'post'],
  ['/api/users/me/profile-banner', 'delete'],
  ['/api/users/me/profile-background', 'post'],
  ['/api/users/me/profile-background', 'delete'],
  ['/api/auth/sso/session', 'post'],
  ['/api/auth/sso/account', 'post'],
  ['/api/auth/sso/bind', 'post'],
] as const satisfies ReadonlyArray<readonly [string, OpenApiMethod]>;

const currentUserApiKeyOperations = [
  ['/api/users/me', 'get'],
  ['/api/users/me', 'patch'],
  ['/api/users/me/avatar', 'post'],
  ['/api/users/me/avatar', 'delete'],
  ['/api/users/me/profile-banner', 'post'],
  ['/api/users/me/profile-banner', 'delete'],
  ['/api/users/me/profile-background', 'post'],
  ['/api/users/me/profile-background', 'delete'],
] as const satisfies ReadonlyArray<readonly [string, OpenApiMethod]>;

const localeRequestParameterRefs = [
  {
    $ref: '#/components/parameters/LocaleHeader',
  },
  {
    $ref: '#/components/parameters/AcceptLanguageHeader',
  },
];

function expectResponseRefs(
  document: OpenApiDocument,
  path: string,
  method: OpenApiMethod,
  responseRefs: Record<string, string>,
) {
  const operation = document.paths[path]?.[method];

  expect(operation).toBeDefined();

  for (const [status, response] of Object.entries(responseRefs)) {
    expect(operation?.responses[status]).toEqual({
      $ref: `#/components/responses/${response}`,
    });
  }
}

function expectSuccessSchemaRef(document: OpenApiDocument, path: string, method: OpenApiMethod, schema: string) {
  const operation = document.paths[path]?.[method];
  const successResponse = operation?.responses['200'] as OpenApiSchemaResponse | undefined;

  expect(operation).toBeDefined();
  expect(successResponse?.content['application/json'].schema).toEqual({
    $ref: `#/components/schemas/${schema}`,
  });
}

function expectCreatedSchemaRef(document: OpenApiDocument, path: string, method: OpenApiMethod, schema: string) {
  const operation = document.paths[path]?.[method];
  const successResponse = operation?.responses['201'] as OpenApiSchemaResponse | undefined;

  expect(operation).toBeDefined();
  expect(successResponse?.content['application/json'].schema).toEqual({
    $ref: `#/components/schemas/${schema}`,
  });
}

function expectSetupConnectionEnum(
  document: OpenApiDocument,
  schemaName: string,
  propertyName: string,
  expectedValues: readonly string[],
) {
  const dataSchema = document.components.schemas[schemaName]?.allOf?.[1]?.properties?.data;

  expect(dataSchema?.properties?.[propertyName]?.enum).toEqual(expectedValues);
}
