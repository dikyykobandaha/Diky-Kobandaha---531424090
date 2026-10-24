import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    globals: true,
    include: ['{src,test}/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
     exclude: [
        'src/**/*.d.ts',
        'test/**',
        'src/types/**',
      ],
    },
    alias: {
      '@config': path.resolve(__dirname, './src/config.ts'),
      '@prisma': path.resolve(__dirname, './src/lib/prisma.ts'),
    },
  },
});
