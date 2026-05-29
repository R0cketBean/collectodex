/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Base './' keeps asset URLs relative so the production build can be
// loaded directly via file:// from inside the packaged Electron app.
// Port 3000 matches what public/electron.js expects in development.
// Output directory is build/ so the existing electron-builder config
// (which globs build/**/*) keeps working without changes.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 3000,
    strictPort: true,
  },
  build: {
    outDir: 'build',
    emptyOutDir: true,
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        'src/vite-env.d.ts',
        'src/types/**',
        'src/reportWebVitals.ts',
        'src/setupTests.ts',
        'src/index.tsx',
      ],
    },
  },
});
