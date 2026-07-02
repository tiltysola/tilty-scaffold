import Module from 'node:module';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..');
const backendDirectory = resolve(repositoryRoot, 'backend');
const backendNodeModules = resolve(backendDirectory, 'node_modules');
const compiledBackendDirectory = resolve(repositoryRoot, 'dist/backend');
const compiledBackendEntry = resolve(compiledBackendDirectory, 'index.js');
const getDefaultNodeModulePaths = Module._nodeModulePaths;

Module._nodeModulePaths = function getBackendFirstNodeModulePaths(from) {
  const paths = getDefaultNodeModulePaths.call(this, from);

  if (!isPathInside(compiledBackendDirectory, from)) {
    return paths;
  }

  return [backendNodeModules, ...paths.filter((modulePath) => modulePath !== backendNodeModules)];
};

process.chdir(backendDirectory);

await import(pathToFileURL(compiledBackendEntry).href);

function isPathInside(root, target) {
  const relativePath = relative(root, target);

  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}
