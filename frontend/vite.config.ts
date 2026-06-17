import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(dirname, '..');

export default defineConfig({
  root: './',
  base: './',
  publicDir: './public',
  resolve: {
    alias: {
      '@': path.resolve(dirname, 'src'),
    },
  },
  plugins: [react(), tailwindcss()],
  build: {
    outDir: path.resolve(dirname, 'dist'),
    emptyOutDir: true,
  },
  server: {
    fs: {
      allow: [repositoryRoot],
    },
    host: '0.0.0.0',
    port: 8011,
    strictPort: true,
  },
});
