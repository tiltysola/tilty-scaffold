export function hasMatchingPasswordConfirmation(input: unknown) {
  if (!input || typeof input !== 'object') {
    return false;
  }

  const form = input as Record<string, unknown>;

  return form.password === form.confirmPassword;
}
