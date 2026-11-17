// @vitest-environment node
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Modul des Hauptprozesses (CommonJS in public/), ohne Electron-Abhängigkeit.
const require = createRequire(import.meta.url);
const cardOcr = require('../../public/cardOcr.js');

describe('binaryPath', () => {
  it('liegt in der gepackten App unter Resources/bin, sonst unter native/bin', () => {
    expect(cardOcr.binaryPath({ isPackaged: true, resourcesPath: '/App/Contents/Resources', appRoot: '/x' })).toBe(
      path.join('/App/Contents/Resources', 'bin', 'card-ocr')
    );
    expect(cardOcr.binaryPath({ isPackaged: false, resourcesPath: '/r', appRoot: '/projekt' })).toBe(
      path.join('/projekt', 'native', 'bin', 'card-ocr')
    );
  });

  it('gibt es nur auf macOS', () => {
    expect(cardOcr.isAvailable(__filename, 'win32')).toBe(false);
    expect(cardOcr.isAvailable('/gibt/es/nicht', 'darwin')).toBe(false);
  });
});

describe('decodeImage', () => {
  it('nimmt Bilder als Data-URL an', () => {
    const { ext, data } = cardOcr.decodeImage(`data:image/jpeg;base64,${Buffer.from('abc').toString('base64')}`);
    expect(ext).toBe('jpg');
    expect(data.toString()).toBe('abc');
    expect(cardOcr.decodeImage('data:image/HEIC;base64,YQ==').ext).toBe('heic');
  });

  it.each([
    undefined,
    42,
    'data:text/html;base64,PGI+',
    'data:image/svg+xml;base64,PHN2Zz4=',
    'file:///etc/passwd',
    'data:image/png;base64,',
  ])('lehnt %s ab', (value) => {
    expect(() => cardOcr.decodeImage(value)).toThrow();
  });

  it('lehnt zu große Bilder ab', () => {
    const huge = 'data:image/png;base64,' + 'A'.repeat(cardOcr.MAX_DATA_URL_LENGTH);
    expect(() => cardOcr.decodeImage(huge)).toThrow(/zu groß/);
  });
});

describe('parseOutput', () => {
  it('behält nur die erwarteten Felder', () => {
    const out = cardOcr.parseOutput(
      JSON.stringify({
        width: 600,
        height: 825,
        cardDetected: true,
        lines: [
          { text: 'SVI DE', confidence: 0.5, pass: 'bottom', x: 0.05, y: 0.94, w: 0.1, h: 0.01, extra: 'weg' },
          { text: 7 },
          null,
          { text: 'Riesenzahn ex', pass: 'seltsam', x: 'a' },
        ],
      })
    );
    expect(out).toEqual({
      width: 600,
      height: 825,
      cardDetected: true,
      lines: [
        { text: 'SVI DE', confidence: 0.5, pass: 'bottom', x: 0.05, y: 0.94, w: 0.1, h: 0.01 },
        { text: 'Riesenzahn ex', confidence: 0, pass: 'full', x: 0, y: 0, w: 0, h: 0 },
      ],
    });
  });
});
