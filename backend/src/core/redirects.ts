export function isSafeRedirectPath(value: string) {
  return value.startsWith('/') && !value.startsWith('//') && !value.includes('\\');
}
