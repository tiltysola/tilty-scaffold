import js from '@eslint/js';
import globals from 'globals';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

import { tiltyI18nPlugin } from '../shared/eslint/tilty-i18n.mjs';
import { tiltyModuleOrderPlugin } from '../shared/eslint/tilty-module-order.mjs';

export default defineConfig([
  globalIgnores(['dist']),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.node,
      sourceType: 'module',
    },
    plugins: {
      'simple-import-sort': simpleImportSort,
      'tilty-module-order': tiltyModuleOrderPlugin,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      'simple-import-sort/imports': [
        'error',
        {
          groups: [['^node:'], ['^'], ['^@tilty'], ['^\\.'], ['^\\u0000']],
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
