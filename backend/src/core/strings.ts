export function parseSeparatedValues(value: string, separator: RegExp | string) {
  return value
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseUniqueSeparatedValues(value: string, separator: RegExp | string) {
  return Array.from(new Set(parseSeparatedValues(value, separator)));
}
