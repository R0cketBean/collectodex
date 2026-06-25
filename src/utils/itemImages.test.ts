import { describe, expect, it } from 'vitest';
import {
  BACK_IMAGE_KEY,
  FRONT_IMAGE_KEY,
  EXTRA_IMAGE_PREFIX,
  countImages,
  createExtraImageKey,
  getOrderedImages,
  getPrimaryImage,
} from './itemImages';

describe('getOrderedImages', () => {
  it('liefert eine leere Liste ohne images', () => {
    expect(getOrderedImages(undefined)).toEqual([]);
    expect(getOrderedImages({})).toEqual([]);
  });

  it('sortiert Vorderseite vor Rückseite vor Extras', () => {
    const ordered = getOrderedImages({
      [`${EXTRA_IMAGE_PREFIX}a`]: 'extra',
      [BACK_IMAGE_KEY]: 'back',
      [FRONT_IMAGE_KEY]: 'front',
    });
    expect(ordered.map(i => i.data)).toEqual(['front', 'back', 'extra']);
    expect(ordered.map(i => i.label)).toEqual(['Vorderseite', 'Rückseite', 'Foto 1']);
  });

  it('nummeriert mehrere Extras fortlaufend', () => {
    const ordered = getOrderedImages({
      [`${EXTRA_IMAGE_PREFIX}1`]: 'e1',
      [`${EXTRA_IMAGE_PREFIX}2`]: 'e2',
    });
    expect(ordered.map(i => i.label)).toEqual(['Foto 1', 'Foto 2']);
  });

  it('überspringt leere Slots', () => {
    const ordered = getOrderedImages({ [FRONT_IMAGE_KEY]: '', [BACK_IMAGE_KEY]: 'back' });
    expect(ordered).toHaveLength(1);
    expect(ordered[0].data).toBe('back');
  });

  it('behandelt unbekannte Alt-Schlüssel als Extras (kein Bild geht verloren)', () => {
    const ordered = getOrderedImages({ legacyKey: 'old' });
    expect(ordered).toHaveLength(1);
    expect(ordered[0].key).toBe('legacyKey');
    expect(ordered[0].label).toBe('Foto 1');
  });
});

describe('getPrimaryImage', () => {
  it('bevorzugt die Vorderseite', () => {
    expect(getPrimaryImage({ [FRONT_IMAGE_KEY]: 'front', [BACK_IMAGE_KEY]: 'back' })).toBe('front');
  });

  it('fällt auf das erste vorhandene Bild zurück', () => {
    expect(getPrimaryImage({ [BACK_IMAGE_KEY]: 'back' })).toBe('back');
  });

  it('liefert null ohne Bilder', () => {
    expect(getPrimaryImage(undefined)).toBeNull();
  });
});

describe('countImages', () => {
  it('zählt nur vorhandene Bilder', () => {
    expect(countImages({ [FRONT_IMAGE_KEY]: 'a', [BACK_IMAGE_KEY]: '', x: 'b' })).toBe(2);
  });
});

describe('createExtraImageKey', () => {
  it('erzeugt eindeutige Schlüssel mit Extra-Präfix', () => {
    const a = createExtraImageKey();
    const b = createExtraImageKey();
    expect(a.startsWith(EXTRA_IMAGE_PREFIX)).toBe(true);
    expect(a).not.toBe(b);
  });
});
