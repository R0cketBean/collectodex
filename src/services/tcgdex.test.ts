import { describe, expect, it } from 'vitest';
import {
  cardImageSources,
  cardImageUrl,
  mapLimit,
  normalizeSearch,
  setLogoSources,
  sumSetValue,
  summarizePricing,
  type CardDetail,
} from './tcgdex';

const withPricing = (
  cardmarket: Record<string, unknown> | null,
  variants: CardDetail['variants'] = { normal: true, reverse: true }
) => ({ pricing: cardmarket ? { cardmarket } : null, variants }) as Pick<CardDetail, 'pricing' | 'variants'>;

describe('summarizePricing', () => {
  it('liest Trend, Tiefstpreis und Reverse-Preis', () => {
    const p = summarizePricing(
      withPricing({ trend: 0.03, low: 0.02, avg30: 0.03, 'trend-holo': 0.16, 'low-holo': 0.02, idProduct: 1 })
    );
    expect(p).toMatchObject({ trend: 0.03, low: 0.02, reverseTrend: 0.16, reverseLow: 0.02, idProduct: 1 });
  });

  it('weist ohne Reverse-Fassung keinen Reverse-Preis aus', () => {
    const p = summarizePricing(withPricing({ trend: 353.78, 'trend-holo': 123.63 }, { holo: true, firstEdition: true }));
    expect(p.trend).toBe(353.78);
    expect(p.reverseTrend).toBeNull();
  });

  it('fällt bei fehlendem Trend auf den Durchschnitt zurück und ignoriert 0/null', () => {
    expect(summarizePricing(withPricing({ trend: 0, avg: 1.5 })).trend).toBe(1.5);
    expect(summarizePricing(withPricing({ trend: null, avg: null })).trend).toBeNull();
    expect(summarizePricing(withPricing(null)).trend).toBeNull();
  });
});

describe('sumSetValue', () => {
  it('summiert nur Karten mit Preis und rundet auf Cent', () => {
    const r = sumSetValue([withPricing({ trend: 0.1 }), withPricing({ trend: 0.2 }), withPricing(null)]);
    expect(r).toEqual({ total: 0.3, priced: 2 });
  });
});

describe('normalizeSearch', () => {
  it('ignoriert Groß-/Kleinschreibung, Akzente und Bindestriche', () => {
    expect(normalizeSearch('Glurak-ex')).toBe(normalizeSearch('glurak ex'));
    expect(normalizeSearch('Pokémon')).toBe('pokemon');
  });
});

describe('cardImageUrl', () => {
  it('hängt Qualität und Format an', () => {
    expect(cardImageUrl('https://a/de/sv/sv01/001')).toBe('https://a/de/sv/sv01/001/low.webp');
    expect(cardImageUrl(undefined)).toBeUndefined();
  });
});

describe('mapLimit', () => {
  it('hält die Reihenfolge, begrenzt die Parallelität und fängt Fehler ab', async () => {
    let running = 0;
    let peak = 0;
    const res = await mapLimit([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      if (n === 4) throw new Error('kaputt');
      return n * 10;
    });
    expect(res).toEqual([10, 20, 30, null, 50, 60, 70]);
    expect(peak).toBeLessThanOrEqual(3);
  });
});

describe('Ersatzbilder', () => {
  const de = 'https://assets.tcgdex.net/de/sv/sv03.5/006';

  it('versucht erst das deutsche, dann das englische Kartenbild', () => {
    expect(cardImageSources(de, undefined)).toEqual([
      { url: `${de}/low.webp`, lang: 'de' },
      { url: 'https://assets.tcgdex.net/en/sv/sv03.5/006/low.webp', lang: 'en' },
    ]);
  });

  it('nutzt ohne deutsches Bild das englische aus dem englischen Set', () => {
    const en = 'https://assets.tcgdex.net/en/base/base1/4';
    expect(cardImageSources(undefined, en, 'high')).toEqual([{ url: `${en}/high.webp`, lang: 'en' }]);
  });

  it('liefert ohne jede Quelle eine leere Liste', () => {
    expect(cardImageSources(undefined, undefined)).toEqual([]);
  });

  it('baut für Sets ohne Logo die englische Logo-Adresse und hängt das Symbol an', () => {
    expect(
      setLogoSources({ id: 'base1', symbol: 'https://assets.tcgdex.net/univ/base/base1/symbol' }, 'base')
    ).toEqual([
      { url: 'https://assets.tcgdex.net/en/base/base1/logo.webp', lang: 'en' },
      { url: 'https://assets.tcgdex.net/univ/base/base1/symbol.webp', lang: 'de' },
    ]);
  });

  it('stellt dem deutschen Logo das englische als Ersatz nach', () => {
    const logo = 'https://assets.tcgdex.net/de/sv/sv10.5w/logo';
    expect(setLogoSources({ id: 'sv10.5w', logo }, 'sv').map((s) => s.url)).toEqual([
      `${logo}.webp`,
      'https://assets.tcgdex.net/en/sv/sv10.5w/logo.webp',
    ]);
  });
});
