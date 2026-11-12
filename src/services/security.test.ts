// @vitest-environment node
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { STORAGE_KEYS } from './StorageService';

// Das Modul gehört zum Hauptprozess (CommonJS in public/), hat aber keine
// Electron-Abhängigkeit und lässt sich deshalb direkt testen.
const require = createRequire(import.meta.url);
const security = require('../../public/security.js');

describe('isAllowedStoreKey', () => {
  it('kennt genau die Schlüssel, die das Fenster benutzt', () => {
    expect([...security.ALLOWED_STORE_KEYS].sort()).toEqual(Object.values(STORAGE_KEYS).sort());
  });

  it('lehnt unbekannte Schlüssel und Nicht-Texte ab', () => {
    expect(security.isAllowedStoreKey('pokemon_collection_items')).toBe(true);
    expect(security.isAllowedStoreKey('__internal__')).toBe(false);
    expect(security.isAllowedStoreKey('pokemon_collection_items.0')).toBe(false);
    expect(security.isAllowedStoreKey('')).toBe(false);
    expect(security.isAllowedStoreKey(undefined)).toBe(false);
    expect(security.isAllowedStoreKey({ toString: () => 'pokemon_collection_items' })).toBe(false);
  });
});

describe('isSafeExternalUrl', () => {
  it('lässt nur https durch', () => {
    expect(security.isSafeExternalUrl('https://www.cardmarket.com/de/Pokemon')).toBe(true);
    expect(security.isSafeExternalUrl('HTTPS://example.com')).toBe(true);
  });

  it.each([
    'http://example.com',
    'file:///etc/passwd',
    'smb://server/freigabe',
    'javascript:alert(1)',
    'mailto:jemand@example.com',
    'cdx-image://local/bild.webp',
    'example.com',
    '',
  ])('lehnt %s ab', (url) => {
    expect(security.isSafeExternalUrl(url)).toBe(false);
  });

  it('lehnt Nicht-Texte ab', () => {
    expect(security.isSafeExternalUrl(null)).toBe(false);
    expect(security.isSafeExternalUrl({ href: 'https://example.com' })).toBe(false);
  });
});

describe('isAppUrl', () => {
  const packaged = 'file:///Applications/CollectODex.app/Contents/Resources/app/build/index.html';

  it('erkennt die gepackte App samt Hash-Routen', () => {
    expect(security.isAppUrl(packaged, packaged)).toBe(true);
    expect(security.isAppUrl(`${packaged}#/kategorie/1`, packaged)).toBe(true);
  });

  it('lehnt andere Dateien und fremde Seiten ab', () => {
    expect(security.isAppUrl('file:///Users/x/Downloads/seite.html', packaged)).toBe(false);
    expect(security.isAppUrl('https://example.com', packaged)).toBe(false);
    expect(security.isAppUrl('data:text/html,<p>x</p>', packaged)).toBe(false);
    expect(security.isAppUrl('', packaged)).toBe(false);
  });

  it('erlaubt in der Entwicklung nur den eigenen Vite-Server', () => {
    const dev = 'http://localhost:3000';
    expect(security.isAppUrl('http://localhost:3000/#/statistik', dev)).toBe(true);
    expect(security.isAppUrl('http://localhost:3001/', dev)).toBe(false);
    expect(security.isAppUrl('https://localhost:3000/', dev)).toBe(false);
  });
});
