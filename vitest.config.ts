import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          exclude: [...configDefaults.exclude, '**/*.smoke.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'smoke',
          include: ['src/**/*.smoke.test.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'dist/**', 'coverage/**', 'node_modules/**'],
    },
  },
});
