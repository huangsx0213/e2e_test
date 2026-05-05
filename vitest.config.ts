import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      'shared': path.resolve(__dirname, 'shared'),
    },
  },
  test: {
    // Use Node-like environment for these tests
    environment: 'node',
    // Allow TypeScript test files
    testTimeout: 30000,
  },
});
