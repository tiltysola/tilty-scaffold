import { existsSync } from 'fs';
import { basename, isAbsolute, relative, resolve } from 'path';

const backendDirectoryName = 'backend';

export function getRuntimeRootDirectory() {
  const cwd = process.cwd();
  const parent = resolve(cwd, '..');

  if (
    basename(cwd) === backendDirectoryName &&
    existsSync(resolve(cwd, 'package.json')) &&
    existsSync(resolve(parent, 'package.json'))
  ) {
    return parent;
  }

  return cwd;
}

export function resolveRuntimePath(value: string, label: string) {
  const root = getRuntimeRootDirectory();
  const resolvedPath = resolve(root, value);

  if (!isPathInside(root, resolvedPath)) {
    throw new Error(`${label} must resolve inside the runtime root directory.`);
  }

  return resolvedPath;
}

export function isPathInside(root: string, target: string) {
  const relativePath = relative(root, target);

  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}
