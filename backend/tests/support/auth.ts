import { type AuthService } from '../../src/modules/auth/auth.service';

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
