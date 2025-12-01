import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
    pool: 'threads',
    coverage: {
      enabled: true,
      provider: 'v8',
      reportsDirectory: 'coverage',
    },
  },
});
