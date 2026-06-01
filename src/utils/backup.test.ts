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

  it('lehnt kaputte Kategorien ab', () => {
    const result = validateBackup({
      categories: [{ id: 'x' /* kein name, keine attributes */ }],
      items: [],
    });
    expect(result.ok).toBe(false);
  });

  it('lehnt kaputte Items ab', () => {
    const result = validateBackup({
      categories: [sampleCategory()],
      items: [{ id: 'i1' /* keine categoryId/values */ }],
    });
    expect(result.ok).toBe(false);
  });

  it('liefert bei Fehler eine beschreibende Meldung', () => {
    const result = validateBackup({ foo: 'bar' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/categories/i);
    }
  });
});
