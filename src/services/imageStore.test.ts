// @vitest-environment node
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Das Modul gehört zum Hauptprozess (CommonJS in public/), hat aber keine
// Electron-Abhängigkeit und lässt sich deshalb direkt testen.
const require = createRequire(import.meta.url);
const imageStore = require('../../public/imageStore.js');

// 1×1-PNG
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const PNG = `data:image/png;base64,${PNG_B64}`;

let tmp: string;
let dir: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cdx-images-'));
  dir = path.join(tmp, 'images');
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('Verweise', () => {
  it('erkennt und zerlegt Verweise, lehnt Pfade ab', () => {
    expect(imageStore.refToFileName('cdx-image://local/abc-123.webp')).toBe('abc-123.webp');
    expect(imageStore.refToFileName('cdx-image://local/abc.webp?x=1')).toBe('abc.webp');
    expect(imageStore.refToFileName('cdx-image://local/../geheim.json')).toBeNull();
    expect(imageStore.refToFileName('cdx-image://local/a/b.png')).toBeNull();
    expect(imageStore.refToFileName('https://example.com/a.png')).toBeNull();
    expect(imageStore.isImageRef(PNG)).toBe(false);
  });
});

describe('saveDataUrl / readAsDataUrl', () => {
  it('schreibt das Bild byte-genau und liest es identisch zurück', () => {
    const ref = imageStore.saveDataUrl(dir, PNG);
    expect(ref).toMatch(/^cdx-image:\/\/local\/[0-9a-f-]+\.png$/);
    const file = imageStore.resolveRef(dir, ref);
    expect(fs.readFileSync(file).equals(Buffer.from(PNG_B64, 'base64'))).toBe(true);
    expect(imageStore.readAsDataUrl(dir, ref)).toBe(PNG);
    expect(fs.readdirSync(dir).some((f) => f.endsWith('.tmp'))).toBe(false);
  });

  it('lehnt alles ab, was keine Bild-Data-URL ist', () => {
    expect(imageStore.saveDataUrl(dir, 'data:text/html;base64,PGI+')).toBeNull();
    expect(imageStore.saveDataUrl(dir, 'https://example.com/a.png')).toBeNull();
    expect(imageStore.saveDataUrl(dir, 'data:image/png;base64,')).toBeNull();
    expect(imageStore.readAsDataUrl(dir, 'cdx-image://local/fehlt.png')).toBeNull();
  });
});

describe('externalizeItems', () => {
  it('lagert nur Base64-Bilder aus und lässt die Eingabe unverändert', () => {
    const items = [
      { id: 'a', images: { image: PNG, imageBack: 'https://assets.tcgdex.net/x/high.webp' } },
      { id: 'b', values: { name: 'ohne Bild' } },
    ];
    const { items: next, moved } = imageStore.externalizeItems(items, dir);
    expect(moved).toBe(1);
    expect(next[0].images.image).toMatch(/^cdx-image:\/\/local\//);
    expect(next[0].images.imageBack).toBe('https://assets.tcgdex.net/x/high.webp');
    expect(next[1]).toBe(items[1]);
    expect(items[0].images!.image).toBe(PNG);
    expect(fs.readdirSync(dir)).toHaveLength(1);
  });
});

describe('migrateInlineImages', () => {
  const setup = (items: unknown[]) => {
    const storeFile = path.join(tmp, 'collectodex-data.json');
    const backupFile = path.join(tmp, 'collectodex-data.vor-bildauslagerung.json');
    const write = (next: unknown[]) =>
      fs.writeFileSync(storeFile, JSON.stringify({ pokemon_collection_items: next, andere: 1 }));
    write(items);
    const read = () => JSON.parse(fs.readFileSync(storeFile, 'utf8')).pokemon_collection_items;
    return { storeFile, backupFile, read, options: { readItems: read, writeItems: write, storeFile, backupFile, dir } };
  };

  it('legt eine Sicherungskopie an, lagert aus und ist beim zweiten Lauf untätig', () => {
    const { storeFile, backupFile, read, options } = setup([{ id: 'a', images: { image: PNG } }, { id: 'b' }]);
    const before = fs.readFileSync(storeFile, 'utf8');

    expect(imageStore.migrateInlineImages(options)).toEqual({ migrated: 1, backupFile });
    expect(fs.readFileSync(backupFile, 'utf8')).toBe(before);
    const ref = read()[0].images.image;
    expect(imageStore.readAsDataUrl(dir, ref)).toBe(PNG);
    expect(fs.readFileSync(storeFile, 'utf8')).not.toContain(PNG_B64);

    expect(imageStore.migrateInlineImages(options)).toEqual({ migrated: 0, backupFile: null });
    expect(fs.readdirSync(dir)).toHaveLength(1);
  });

  it('fasst eine Datendatei ohne Base64-Bilder nicht an', () => {
    const { storeFile, backupFile, options } = setup([{ id: 'a', images: { image: 'cdx-image://local/x.png' } }]);
    const before = fs.readFileSync(storeFile, 'utf8');
    expect(imageStore.migrateInlineImages(options).migrated).toBe(0);
    expect(fs.existsSync(backupFile)).toBe(false);
    expect(fs.readFileSync(storeFile, 'utf8')).toBe(before);
  });

  it('lässt die Datendatei unverändert, wenn das Schreiben der Bilder scheitert', () => {
    const { storeFile, options } = setup([{ id: 'a', images: { image: PNG } }]);
    const before = fs.readFileSync(storeFile, 'utf8');
    fs.writeFileSync(dir, 'blockiert'); // Datei statt Ordner → mkdir schlägt fehl
    expect(() => imageStore.migrateInlineImages(options)).toThrow();
    expect(fs.readFileSync(storeFile, 'utf8')).toBe(before);
  });

  it('überschreibt eine vorhandene Sicherungskopie nicht', () => {
    const { backupFile, options } = setup([{ id: 'a', images: { image: PNG } }]);
    fs.writeFileSync(backupFile, 'ältere Sicherung');
    imageStore.migrateInlineImages(options);
    expect(fs.readFileSync(backupFile, 'utf8')).toBe('ältere Sicherung');
  });
});
