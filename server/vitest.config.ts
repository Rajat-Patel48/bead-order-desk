import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 60000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:5432/beads_test',
      JWT_SECRET: 'test-secret-test-secret',
      WA_VERIFY_TOKEN: 'verify-me',
    },
  },
});
