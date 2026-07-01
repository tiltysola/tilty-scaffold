import { readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { describe, expect, it } from 'vitest';

import { backendMessages } from '../src/i18n';

describe('backend i18n catalog', () => {
  it('covers literal AppError codes used by backend source files', () => {
    const sourceRoot = resolve(process.cwd(), 'src');
    const defaultMessages = backendMessages['en-US'];
    const appErrorCodes = new Map<string, Set<string>>();

    for (const filePath of listTypeScriptFiles(sourceRoot)) {
      const source = readFileSync(filePath, 'utf8');

      for (const match of source.matchAll(/new AppError\(\s*['"]([A-Z0-9_]+)['"]/g)) {
        const code = match[1]!;
        const files = appErrorCodes.get(code) ?? new Set<string>();

        files.add(filePath.slice(sourceRoot.length + 1));
        appErrorCodes.set(code, files);
      }
    }

    const missingCodes = [...appErrorCodes]
      .filter(([code]) => !Object.hasOwn(defaultMessages, `error.${code}`))
      .map(([code, files]) => `${code}: ${[...files].join(', ')}`)
      .sort();

    expect(missingCodes).toEqual([]);
  });

  it('uses matching catalog message ids for AppError catalog messages', () => {
    const sourceRoot = resolve(process.cwd(), 'src');
    const mismatchedMessageIds: string[] = [];
    const nonCatalogMessages: string[] = [];

    for (const filePath of listTypeScriptFiles(sourceRoot)) {
      const source = readFileSync(filePath, 'utf8');

      for (const match of source.matchAll(/new AppError\(\s*['"]([A-Z0-9_]+)['"]\s*,\s*['"]([^'"]+)['"]/g)) {
        const code = match[1]!;
        const messageId = match[2]!;

        if (!messageId.startsWith('error.')) {
          nonCatalogMessages.push(`${filePath.slice(sourceRoot.length + 1)}: ${code}`);
        } else if (messageId !== `error.${code}`) {
          mismatchedMessageIds.push(`${filePath.slice(sourceRoot.length + 1)}: ${code} -> ${messageId}`);
        }
      }
    }

    expect(mismatchedMessageIds.sort()).toEqual([]);
    expect(nonCatalogMessages.sort()).toEqual([]);
  });

  it('keeps exact catalog error messages out of AppError call sites', () => {
    const sourceRoot = resolve(process.cwd(), 'src');
    const defaultMessages = backendMessages['en-US'];
    const redundantErrors: string[] = [];

    for (const filePath of listTypeScriptFiles(sourceRoot)) {
      const source = readFileSync(filePath, 'utf8');

      for (const match of source.matchAll(/new AppError\(\s*['"]([A-Z0-9_]+)['"]\s*,\s*['"]([^'"]+)['"]\s*,/g)) {
        const code = match[1]!;
        const catalogMessage = defaultMessages[`error.${code}` as keyof typeof defaultMessages];

        if (!catalogMessage || catalogMessage !== match[2]) {
          continue;
        }

        redundantErrors.push(`${filePath.slice(sourceRoot.length + 1)}: ${code}`);
      }
    }

    expect(redundantErrors.sort()).toEqual([]);
  });
});

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      return listTypeScriptFiles(entryPath);
    }

    return entry.isFile() && entry.name.endsWith('.ts') ? [entryPath] : [];
  });
}
