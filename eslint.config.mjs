import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import vitest from 'eslint-plugin-vitest';
import tseslint from 'typescript-eslint';

export default defineConfig(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    ignores: ['dist', 'coverage', 'node_modules', '.husky'],
  },
  {
    files: ['src/**/*.{test,spec}.ts'],
    plugins: { vitest },
    rules: {
      ...vitest.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
