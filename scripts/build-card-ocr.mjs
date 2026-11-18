// Baut das Swift-Hilfsprogramm des Kartenscanners (#168) als Universal-Binary
// (arm64 + x86_64) nach native/bin/card-ocr. Nur auf macOS – auf anderen
// Systemen gibt es den Scanner (noch) nicht, das Skript endet dort ohne Fehler.

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'darwin') {
  console.log('card-ocr: nur auf macOS, übersprungen.');
  process.exit(0);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'native', 'card-ocr', 'main.swift');
const outDir = join(root, 'native', 'bin');
const out = join(outDir, 'card-ocr');
// Electron 45 läuft ab macOS 12; Vision liest Deutsch ab Revision 2 (macOS 11).
const MIN_MACOS = '12.0';

mkdirSync(outDir, { recursive: true });
const parts = ['arm64', 'x86_64'].map((arch) => {
  const file = `${out}-${arch}`;
  execFileSync('xcrun', ['swiftc', '-O', '-target', `${arch}-apple-macos${MIN_MACOS}`, source, '-o', file], {
    stdio: 'inherit',
  });
  return file;
});
execFileSync('lipo', ['-create', ...parts, '-output', out], { stdio: 'inherit' });
for (const file of parts) rmSync(file);
console.log(`card-ocr gebaut: ${out}`);
