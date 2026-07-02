import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(dirname, '..');
const sharedSourceRoot = path.resolve(repositoryRoot, 'shared/src');

export default defineConfig({
  root: './',
  base: './',
  publicDir: './public',
  resolve: {
    alias: {
      '@': path.resolve(dirname, 'src'),
      '@tilty/shared/access-control': path.resolve(sharedSourceRoot, 'access-control.ts'),
      '@tilty/shared/auth': path.resolve(sharedSourceRoot, 'auth.ts'),
      '@tilty/shared/i18n': path.resolve(sharedSourceRoot, 'i18n.ts'),
      '@tilty/shared/paths': path.resolve(sharedSourceRoot, 'paths.ts'),
      '@tilty/shared/setup': path.resolve(sharedSourceRoot, 'setup.ts'),
      '@tilty/shared/validation': path.resolve(sharedSourceRoot, 'validation.ts'),
      '@tilty/shared': path.resolve(sharedSourceRoot, 'index.ts'),
    },
    dedupe: ['react', 'react-dom'],
  },
  plugins: [react(), tailwindcss()],
  build: {
    outDir: path.resolve(repositoryRoot, 'dist/frontend'),
    emptyOutDir: true,
  },
  server: {
    fs: {
      allow: [repositoryRoot],
    },
    host: '0.0.0.0',
    port: 8011,
    proxy: {
      '/api': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
    },
    allowedHosts: ['dev.tiltysola.com'],
    strictPort: true,
  },
});
