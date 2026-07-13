import { AuthVerificationPurpose } from '@tilty/shared/auth';

import { type createServices } from '../../src/composition/services';
import { type AuthService, defaultAuthSessionRequestContext } from '../../src/modules/auth/auth.service';
import { createTotpCode } from './totp';

export function registerTestUser(authService: AuthService, displayName: string, email: string) {
  return authService.register({
    username: toTestUsername(displayName),
    displayName,
    email,
    password: 'password123',
    confirmPassword: 'password123',
  });
}

function toTestUsername(displayName: string) {
  return displayName.toLowerCase().replace(/\s+/g, '_');
}

export async function registerRootWithUserManagementAccess(
  services: Pick<ReturnType<typeof createServices>, 'auth' | 'totp' | 'user'>,
  displayName: string,
  email: string,
) {
  return registerUserWithUserManagementAccess(services, displayName, email);
}

export async function registerUserWithUserManagementAccess(
  services: Pick<ReturnType<typeof createServices>, 'auth' | 'totp' | 'user'>,
  displayName: string,
  email: string,
) {
  const session = await registerTestUser(services.auth, displayName, email);
  const user = await services.user.findByEmail(email);

  if (!user) {
    throw new Error('User was not created.');
  }

  const setup = await services.totp.createSetup(user);

  await services.totp.enable(user, setup.setupToken, createTotpCode(setup.secret));

  const challenge = await services.auth.createVerificationChallenge(
    session.accessToken,
    AuthVerificationPurpose.UserManagement,
    defaultAuthSessionRequestContext,
  );

  if ('verified' in challenge) {
    return session;
  }

  await services.auth.verifyAuthenticationChallenge(
    {
      code: createTotpCode(setup.secret),
      method: 'totp',
      verificationToken: challenge.verificationToken,
    },
    defaultAuthSessionRequestContext,
  );

  return session;
}
