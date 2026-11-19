import { describe, expect, it, vi } from 'vitest';
import { createVisualMatcher, memoryCache, visualSources } from './imageMatch';
import { FINGERPRINT_LENGTH, type Fingerprint } from '../utils/imageFingerprint';

/** Fingerabdruck mit einem Muster je Zahl: gleiche Zahl = gleiches Bild. */
const pattern = (seed: number): Fingerprint => {
  const fp = new Int8Array(FINGERPRINT_LENGTH);
  for (let i = 0; i < fp.length; i++) fp[i] = Math.sin(i * (seed + 1) * 0.37) > 0 ? 40 : -40;
  return fp;
};

const base1 = { cardId: 'base1-4', setId: 'base1', localId: '4', serieId: 'base' };

describe('visualSources', () => {
  it('weicht bei deutschen Karten ohne Bild auf die englischen Bilder aus', () => {
    expect(visualSources(base1, 'de')).toEqual([
      'https://assets.tcgdex.net/en/base/base1/4/low.webp',
      'https://images.pokemontcg.io/base1/4.png',
    ]);
  });

  it('nimmt zuerst das eigene Bild der Karte', () => {
    const image = 'https://assets.tcgdex.net/de/sv/sv01/123';
    expect(visualSources({ cardId: 'sv01-123', setId: 'sv01', localId: '123', image }, 'de')[0]).toBe(`${image}/low.webp`);
  });
});

describe('createVisualMatcher', () => {
  it('misst den Abstand zum Scan und lädt jedes Katalogbild nur einmal', async () => {
    const fingerprintOf = vi.fn(async (url: string) => (url.startsWith('data:') || url.includes('/4/') ? pattern(1) : pattern(2)));
    const cache = memoryCache();
    const matcher = createVisualMatcher('data:image/jpeg;base64,AAAA', 'de', { cache, fingerprintOf });
    expect(await matcher.distance(base1)).toBe(0);
    expect(await matcher.distance(base1)).toBe(0);
    expect(await matcher.distance({ ...base1, cardId: 'base1-5', localId: '5' })).toBeGreaterThan(0.3);
    // Scan + zwei Katalogbilder.
    expect(fingerprintOf).toHaveBeenCalledTimes(3);

    // Ein neuer Scan nutzt den Zwischenspeicher.
    const next = createVisualMatcher('data:image/jpeg;base64,BBBB', 'de', { cache, fingerprintOf });
    await next.distance(base1);
    expect(fingerprintOf).toHaveBeenCalledTimes(4);
  });

  it('versucht die nächste Quelle und meldet null, wenn keine lädt', async () => {
    const fingerprintOf = vi.fn(async (url: string) => {
      if (url.startsWith('data:')) return pattern(1);
      if (url.includes('pokemontcg')) return pattern(1);
      throw new Error('404');
    });
    const matcher = createVisualMatcher('data:x', 'de', { cache: memoryCache(), fingerprintOf });
    expect(await matcher.distance(base1)).toBe(0);
    expect(fingerprintOf).toHaveBeenCalledWith('https://images.pokemontcg.io/base1/4.png');

    const none = createVisualMatcher('data:x', 'ja', { cache: memoryCache(), fingerprintOf });
    const card = { cardId: 'SV1a-001', setId: 'SV1a', localId: '001' };
    expect(await none.distance(card)).toBeNull();
    // Fehlende Bilder werden in derselben Sitzung nicht erneut versucht.
    const calls = fingerprintOf.mock.calls.length;
    expect(await none.distance(card)).toBeNull();
    expect(fingerprintOf.mock.calls.length).toBe(calls);
  });

  it('vergleicht japanische Vintage-Karten mit dem englischen Artwork (#180)', async () => {
    // PMCG1-021 (リザードン) hat kein Bild; Gegenstück ist Base Set Glurak.
    const fingerprintOf = vi.fn(async (url: string) => {
      if (url.startsWith('data:') || url.includes('/base1/4')) return pattern(1);
      throw new Error('404');
    });
    const matcher = createVisualMatcher('data:x', 'ja', { cache: memoryCache(), fingerprintOf });
    const card = { cardId: 'PMCG1-021', setId: 'PMCG1', localId: '021', serieId: 'PMCG' };
    expect(await matcher.distance(card)).toBe(0);
    expect(fingerprintOf).toHaveBeenCalledWith('https://assets.tcgdex.net/en/base/base1/4/low.webp');
    // Ohne Gegenstück bleibt es bei „kein Bild“.
    expect(await matcher.distance({ cardId: 'VS1-001', setId: 'VS1', localId: '001' })).toBeNull();
    // Deutsche oder englische Karten nutzen die Tabelle nicht.
    const de = createVisualMatcher('data:x', 'de', { cache: memoryCache(), fingerprintOf });
    expect(await de.distance(card)).toBeNull();
  });
});
