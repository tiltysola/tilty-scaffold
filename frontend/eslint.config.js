import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

import { reactHookGroups, tiltyHooksPlugin } from '../shared/eslint/tilty-hooks.mjs';
import { tiltyI18nPlugin } from '../shared/eslint/tilty-i18n.mjs';
import { tiltyModuleOrderPlugin } from '../shared/eslint/tilty-module-order.mjs';

export default defineConfig([
  globalIgnores(['dist', 'src/shadcn/**']),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.browser,
      sourceType: 'module',
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'simple-import-sort': simpleImportSort,
      'tilty-hooks': tiltyHooksPlugin,
      'tilty-module-order': tiltyModuleOrderPlugin,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'tilty-hooks/react-hook-order': [
        'error',
        {
          groups: reactHookGroups,
        },
      ],
      'simple-import-sort/imports': [
        'error',
        {
          groups: [['^react'], ['^'], ['^@'], ['^@/pages', '^@/components'], ['^\\.'], ['^\\u0000']],
        },
      ],
      'tilty-module-order/module-types-before-runtime': 'error',
    },
  },
  {
    files: ['src/i18n/messages/zh-CN.ts'],
    plugins: {
      'tilty-i18n': tiltyI18nPlugin,
    },
    rules: {
      'tilty-i18n/message-catalog-order': [
        'error',
        {
          referenceFile: 'src/i18n/messages/en-US.ts',
          referenceObjectName: 'messages',
          targetObjectName: 'messages',
        },
      ],
    },
  },
]);
