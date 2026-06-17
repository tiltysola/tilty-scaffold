export function isSafeRelativePath(value: string) {
  return value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') && !hasControlCharacter(value);
}

function hasControlCharacter(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);

    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }

  return false;
}
