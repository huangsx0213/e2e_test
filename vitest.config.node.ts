import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'client'),
      'shared': path.resolve(__dirname, 'shared'),
    },
  },
  test: {
    environment: 'node',
    testTimeout: 30000,
  },
});
