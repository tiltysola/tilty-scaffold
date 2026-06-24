import { isAbsolute, relative, resolve } from 'path';

export function resolveApplicationPath(path: string, label: string) {
  const root = process.cwd();
  const resolvedPath = resolve(root, path);

  if (!isPathInside(root, resolvedPath)) {
    throw new Error(`${label} must resolve inside the application directory.`);
  }

  return resolvedPath;
}

export function isPathInside(root: string, target: string) {
  const relativePath = relative(root, target);

  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}
