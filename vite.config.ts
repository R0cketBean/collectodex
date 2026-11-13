/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Content-Security-Policy der fertigen App (#133): Skripte nur aus dem eigenen
// Paket, Netzwerk nur zu den beiden Bildquellen und zur Katalog-API.
// `cdx-image:` ist die eigene Bildablage (public/imageStore.js), `data:` und
// `blob:` braucht die Bildverkleinerung bzw. der Export. Inline-Stile setzt
// React selbst (style-Attribute). Nur im Build: Der Entwicklungsserver lädt
// Skripte inline und per WebSocket nach.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: cdx-image: https://assets.tcgdex.net https://images.pokemontcg.io",
  "connect-src 'self' data: blob: cdx-image: https://api.tcgdex.net",
  "font-src 'self' data:",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

const contentSecurityPolicy = (): Plugin => ({
  name: 'collectodex-csp',
  apply: 'build',
  transformIndexHtml: () => [
    {
      tag: 'meta',
      attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
      injectTo: 'head-prepend',
    },
  ],
});

// Base './' keeps asset URLs relative so the production build can be
// loaded directly via file:// from inside the packaged Electron app.
// Port 3000 matches what public/electron.js expects in development.
// Output directory is build/ so the existing electron-builder config
// (which globs build/**/*) keeps working without changes.
export default defineConfig({
  plugins: [react(), contentSecurityPolicy()],
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
        'src/index.tsx',
      ],
    },
  },
});
