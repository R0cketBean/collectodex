import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

// Bewusst schlank: Fehler sind echte Probleme (Hook-Regeln, ungenutzter Code),
// Stilfragen bleiben außen vor. `any` ist im Bestand weit verbreitet und wird
// schrittweise abgebaut, deshalb hier (noch) keine Regel dafür.
export default tseslint.config(
  { ignores: ['build/**', 'dist/**', 'docs/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  {
    files: ['public/*.js', 'scripts/**', '*.js', '*.cjs', '*.mjs', 'vite.config.ts'],
    languageOptions: { globals: { ...globals.node }, sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['scripts/**/*.mjs', '*.mjs', 'vite.config.ts'],
    // Die Skripte enthalten Code, der per Playwright im Browser läuft.
    languageOptions: { sourceType: 'module', globals: { ...globals.node, ...globals.browser } },
  }
);
