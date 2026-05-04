import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use Node-like environment for these tests
    environment: 'node',
    // Allow TypeScript test files
    testTimeout: 30000,
  },
});
