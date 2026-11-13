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

describe('Vorschaubilder', () => {
  // Der Hauptprozess prüft nur den Typ der Data-URL, nicht den Bildinhalt.
  const WEBP = 'data:image/webp;base64,UklGRhIAAABXRUJQVlA4TAYAAAAvAAAAAAfQ//73v/+BiOh/AAA=';

  it('legt das Vorschaubild neben das Original und liefert dessen Verweis', () => {
    const ref = imageStore.saveDataUrl(dir, PNG);
    const thumb = imageStore.saveThumbnail(dir, ref, WEBP);
    expect(thumb).toBe(ref.replace(/\.png$/, '_thumb.webp'));
    expect(imageStore.resolveRef(dir, thumb)).not.toBeNull();
    expect(fs.readdirSync(dir).some((f: string) => f.endsWith('.tmp'))).toBe(false);
  });

  it('lehnt fehlende Originale, andere Formate und Vorschaubilder von Vorschaubildern ab', () => {
    const ref = imageStore.saveDataUrl(dir, PNG);
    expect(imageStore.saveThumbnail(dir, 'cdx-image://local/fehlt.png', WEBP)).toBeNull();
    expect(imageStore.saveThumbnail(dir, ref, PNG)).toBeNull();
    expect(imageStore.saveThumbnail(dir, 'cdx-image://local/../x.png', WEBP)).toBeNull();
    const thumb = imageStore.saveThumbnail(dir, ref, WEBP);
    expect(imageStore.saveThumbnail(dir, thumb, WEBP)).toBeNull();
    expect(imageStore.thumbFileName('abc.jpg')).toBe('abc_thumb.webp');
    expect(imageStore.thumbFileName('abc_thumb.webp')).toBeNull();
  });
});

describe('Aufräumen', () => {
  const WEBP = 'data:image/webp;base64,UklGRhIAAABXRUJQVlA4TAYAAAAvAAAAAAfQ//73v/+BiOh/AAA=';
  const HOUR = 60 * 60 * 1000;
  // Standard in den Tests: Alle Dateien gelten als alt genug.
  const later = () => Date.now() + 2 * HOUR;
  const fileOf = (ref: string) => ref.slice('cdx-image://local/'.length);

  it('zählt Belegung und erkennt Dateien ohne Eintrag samt ihrer Vorschaubilder', () => {
    const used = imageStore.saveDataUrl(dir, PNG);
    const usedThumb = imageStore.saveThumbnail(dir, used, WEBP);
    const orphan = imageStore.saveDataUrl(dir, PNG);
    const orphanThumb = imageStore.saveThumbnail(dir, orphan, WEBP);
    const items = [{ id: 'a', images: { front: used } }, { id: 'b' }];

    const scan = imageStore.scanImages({ dir, items, now: later() });
    expect(scan.blocked).toBe(false);
    expect(scan.files).toBe(4);
    expect(scan.bytes).toBe(fs.readdirSync(dir).reduce((n: number, f: string) => n + fs.statSync(path.join(dir, f)).size, 0));
    expect(scan.orphans.sort()).toEqual([fileOf(orphan), fileOf(orphanThumb)].sort());
    expect(scan.orphanBytes).toBeGreaterThan(0);
    expect(scan.orphans).not.toContain(fileOf(usedThumb));
  });

  it('lässt fremde Dateien und Unterordner außen vor, zählt aber Schreibreste', () => {
    const used = imageStore.saveDataUrl(dir, PNG);
    fs.writeFileSync(path.join(dir, '.DS_Store'), 'x');
    fs.writeFileSync(path.join(dir, 'Notizen zu den Bildern.txt'), 'x');
    fs.writeFileSync(path.join(dir, 'urlaub.jpg'), 'x');
    fs.writeFileSync(path.join(dir, 'fremd.txt.tmp'), 'x');
    fs.mkdirSync(path.join(dir, '11111111-2222-3333-4444-555555555555.png'));
    const rest = `${fileOf(used).replace(/^.{8}/, '00000000')}.tmp`;
    fs.writeFileSync(path.join(dir, rest), 'halb');

    const scan = imageStore.scanImages({ dir, items: [{ images: { a: used } }], now: later() });
    expect(scan.files).toBe(2);
    expect(scan.orphans).toEqual([rest]);
  });

  it('lässt frisch abgelegte Dateien in Ruhe', () => {
    imageStore.saveDataUrl(dir, PNG);
    const items = [{ id: 'a', images: {} }];
    expect(imageStore.scanImages({ dir, items }).orphans).toEqual([]);
    expect(imageStore.scanImages({ dir, items, now: Date.now() + imageStore.MIN_ORPHAN_AGE_MS + 1000 }).orphans).toHaveLength(1);
  });

  it('kommt ohne Bilderordner zurecht', () => {
    expect(imageStore.scanImages({ dir, items: [{ id: 'a' }] })).toEqual({
      files: 0,
      bytes: 0,
      orphans: [],
      orphanBytes: 0,
      blocked: false,
    });
  });

  it('räumt nur Verwaistes in den Papierkorb und fasst den Rest nicht an', async () => {
    const used = imageStore.saveDataUrl(dir, PNG);
    const usedThumb = imageStore.saveThumbnail(dir, used, WEBP);
    const orphan = imageStore.saveDataUrl(dir, PNG);
    imageStore.saveThumbnail(dir, orphan, WEBP);
    fs.writeFileSync(path.join(dir, 'fremd.txt'), 'x');
    const trashed: string[] = [];
    const trash = async (file: string) => {
      trashed.push(path.basename(file));
      fs.rmSync(file);
    };

    const result = await imageStore.cleanupOrphans({ dir, items: [{ images: { a: used } }], trash, now: later() });
    expect(result).toMatchObject({ blocked: false, removed: 2, failed: 0 });
    expect(result.bytes).toBeGreaterThan(0);
    expect(trashed.sort()).toEqual([fileOf(orphan), fileOf(orphan).replace(/\.png$/, '_thumb.webp')].sort());
    expect(fs.readdirSync(dir).sort()).toEqual([fileOf(used), fileOf(usedThumb), 'fremd.txt'].sort());
  });

  it('räumt nie auf, wenn keine Einträge geladen sind', async () => {
    imageStore.saveDataUrl(dir, PNG);
    const trash = async () => {
      throw new Error('darf nicht aufgerufen werden');
    };
    for (const items of [[], undefined, null, 'kaputt']) {
      expect(imageStore.scanImages({ dir, items, now: later() }).blocked).toBe(true);
      expect(await imageStore.cleanupOrphans({ dir, items, trash, now: later() })).toEqual({
        blocked: true,
        removed: 0,
        bytes: 0,
        failed: 0,
      });
    }
    expect(fs.readdirSync(dir)).toHaveLength(1);
  });

  it('lässt liegen, was sich nicht in den Papierkorb legen lässt', async () => {
    imageStore.saveDataUrl(dir, PNG);
    imageStore.saveDataUrl(dir, PNG);
    let calls = 0;
    const trash = async (file: string) => {
      calls += 1;
      if (calls === 1) throw new Error('Papierkorb nicht erreichbar');
      fs.rmSync(file);
    };
    const result = await imageStore.cleanupOrphans({ dir, items: [{ id: 'a' }], trash, now: later() });
    expect(result).toMatchObject({ removed: 1, failed: 1 });
    expect(fs.readdirSync(dir)).toHaveLength(1);
  });
});
