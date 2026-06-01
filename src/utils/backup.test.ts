import { describe, it, expect } from 'vitest';
import {
  wrapBackup,
  validateBackup,
  BACKUP_FORMAT_VERSION,
} from './backup';
import type { Category, CollectionItem } from '../types/models';

const sampleCategory = (): Category => ({
  id: 'cat_1',
  name: 'Sealed',
  attributes: [],
  order: 0,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
});

const sampleItem = (): CollectionItem => ({
  id: 'item_1',
  categoryId: 'cat_1',
  values: { name: 'ETB' },
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
});

describe('wrapBackup', () => {
  it('verpackt Daten in eine versionierte Hülle', () => {
    const env = wrapBackup({ categories: [sampleCategory()], items: [sampleItem()] });
    expect(env.app).toBe('CollectODex');
    expect(env.version).toBe(BACKUP_FORMAT_VERSION);
    expect(typeof env.exportedAt).toBe('string');
    expect(env.data.categories).toHaveLength(1);
    expect(env.data.items).toHaveLength(1);
  });
});

describe('validateBackup', () => {
  it('akzeptiert die neue versionierte Hülle', () => {
    const env = wrapBackup({ categories: [sampleCategory()], items: [sampleItem()] });
    const result = validateBackup(JSON.parse(JSON.stringify(env)));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.categories).toHaveLength(1);
      expect(result.data.items).toHaveLength(1);
    }
  });

  it('akzeptiert das alte bare {categories, items}-Format (Abwärtskompatibilität)', () => {
    const old = { categories: [sampleCategory()], items: [sampleItem()] };
    const result = validateBackup(JSON.parse(JSON.stringify(old)));
    expect(result.ok).toBe(true);
  });

  it('akzeptiert leere, aber strukturell gültige Daten', () => {
    const result = validateBackup({ categories: [], items: [] });
    expect(result.ok).toBe(true);
  });

  it('lehnt Nicht-Objekte ab', () => {
    expect(validateBackup(null).ok).toBe(false);
    expect(validateBackup('text').ok).toBe(false);
    expect(validateBackup(42).ok).toBe(false);
    expect(validateBackup([]).ok).toBe(false);
  });

  it('lehnt fehlende Arrays ab', () => {
    expect(validateBackup({ items: [] }).ok).toBe(false);
    expect(validateBackup({ categories: [] }).ok).toBe(false);
  });

  it('repariert unvollständige Kategorien statt sie abzulehnen (Regression: eigene Sicherung)', () => {
    // Eine real existierende Kategorie ohne attributes-Array (kommt in
    // gewachsenen Sammlungen vor) muss importierbar bleiben.
    const result = validateBackup({
      categories: [{ id: 'cat_x', name: 'Alt', /* kein attributes */ }],
      items: [],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.categories).toHaveLength(1);
      expect(result.data.categories[0].attributes).toEqual([]);
      expect(result.data.categories[0].id).toBe('cat_x');
    }
  });

  it('füllt fehlenden Kategorienamen mit Platzhalter', () => {
    const result = validateBackup({
      categories: [{ id: 'cat_y' }],
      items: [],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.categories[0].name).toBe('Unbenannte Kategorie');
    }
  });

  it('überspringt unrettbare Kategorien (kein Objekt / keine id)', () => {
    const result = validateBackup({
      categories: [null, 'kaputt', { id: 'cat_ok', name: 'OK', attributes: [] }],
      items: [],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.categories).toHaveLength(1);
      expect(result.data.categories[0].id).toBe('cat_ok');
    }
  });

  it('repariert Items mit fehlendem values, überspringt Items ohne categoryId', () => {
    const result = validateBackup({
      categories: [sampleCategory()],
      items: [
        { id: 'i1', categoryId: 'cat_1' /* kein values */ },
        { id: 'i2' /* keine categoryId -> übersprungen */ },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.items).toHaveLength(1);
      expect(result.data.items[0].values).toEqual({});
    }
  });

  it('liefert bei Fehler eine beschreibende Meldung', () => {
    const result = validateBackup({ foo: 'bar' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/categories/i);
    }
  });
});
