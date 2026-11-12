import { describe, expect, it, vi } from 'vitest';
import {
  cardImageSources,
  cardImageUrl,
  catalogCardImageSources,
  displaySetName,
  fetchSet,
  fetchSetList,
  localizeSet,
  pokemonTcgIoImage,
  pokemonTcgIoSetId,
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
      { url: 'https://images.pokemontcg.io/base1/logo.png', lang: 'en' },
      { url: 'https://assets.tcgdex.net/univ/base/base1/symbol.webp', lang: 'de' },
    ]);
  });

  it('stellt dem deutschen Logo das englische als Ersatz nach', () => {
    const logo = 'https://assets.tcgdex.net/de/sv/sv10.5w/logo';
    expect(setLogoSources({ id: 'sv10.5w', logo }, 'sv').map((s) => s.url)).toEqual([
      `${logo}.webp`,
      'https://assets.tcgdex.net/en/sv/sv10.5w/logo.webp',
      'https://images.pokemontcg.io/sv10pt5w/logo.png',
    ]);
  });
});

describe('fetchSet', () => {
  const respond = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 404, json: async () => body }) as Response;

  it('nimmt die englische Kartenliste, wenn die deutsche leer ist', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/de/sets/leer1')) return respond({ id: 'leer1', name: 'Deutsches Set', cards: [] });
      if (url.includes('/en/sets/leer1'))
        return respond({ id: 'leer1', name: 'English Set', cards: [{ id: 'leer1-CC001', localId: 'CC001', name: 'Blastoise' }] });
      return respond({}, false);
    });
    const set = await fetchSet('leer1');
    expect(set.name).toBe('Deutsches Set');
    expect(set.cards).toEqual([{ id: 'leer1-CC001', localId: 'CC001', name: 'Blastoise' }]);
    fetchMock.mockRestore();
  });

  it('fragt die englische Fassung nicht an, wenn deutsche Karten vorliegen', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      respond({ id: 'voll1', name: 'Set', cards: [{ id: 'voll1-1', localId: '1', name: 'Glurak' }] })
    );
    expect((await fetchSet('voll1')).cards).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockRestore();
  });
});

describe('pokemontcg.io als Bildquelle', () => {
  it('übersetzt die Set-Kennungen', () => {
    expect(pokemonTcgIoSetId('sv03.5')).toBe('sv3pt5');
    expect(pokemonTcgIoSetId('swsh12.5gg')).toBe('swsh12pt5gg');
    expect(pokemonTcgIoSetId('sm7.5')).toBe('sm75');
    expect(pokemonTcgIoSetId('swsh4.5sv')).toBe('swsh45sv');
    expect(pokemonTcgIoSetId('sv01')).toBe('sv1');
    expect(pokemonTcgIoSetId('base1')).toBe('base1');
    expect(pokemonTcgIoSetId('swsh9tg')).toBe('swsh9tg');
    expect(pokemonTcgIoSetId('hgssp')).toBe('hsp');
    expect(pokemonTcgIoSetId('cel25cc')).toBe('cel25c');
  });

  it('baut Bildadressen ohne führende Nullen und mit Sondernummern', () => {
    expect(pokemonTcgIoImage('sv03.5', '006')).toBe('https://images.pokemontcg.io/sv3pt5/6.png');
    expect(pokemonTcgIoImage('swsh9tg', 'TG05', 'high')).toBe('https://images.pokemontcg.io/swsh9tg/TG05_hires.png');
    expect(pokemonTcgIoImage('cel25cc', 'CC001')).toBe('https://images.pokemontcg.io/cel25c/2_A.png');
    expect(pokemonTcgIoImage('cel25cc', 'CC016', 'high')).toBe('https://images.pokemontcg.io/cel25c/15_D_hires.png');
  });

  it('hängt sie als letzte Quelle an, wenn die Karte bekannt ist', () => {
    const de = 'https://assets.tcgdex.net/de/sv/sv03.5/006';
    expect(cardImageSources(de, undefined, 'low', { setId: 'sv03.5', localId: '006' }).map((s) => s.url)).toEqual([
      `${de}/low.webp`,
      'https://assets.tcgdex.net/en/sv/sv03.5/006/low.webp',
      'https://images.pokemontcg.io/sv3pt5/6.png',
    ]);
    expect(cardImageSources(undefined, undefined, 'low', { setId: 'cel25cc', localId: 'CC002' })).toEqual([
      { url: 'https://images.pokemontcg.io/cel25c/4_A.png', lang: 'en' },
    ]);
  });
});

describe('Katalogsprachen', () => {
  it('schreibt „Classic Collection“ statt der deutschen Übersetzungen', () => {
    expect(displaySetName('Celebrations Klassische Kollektion')).toBe('Celebrations Classic Collection');
    expect(displaySetName('30 Jahre: Klassische Sammlung')).toBe('30 Jahre: Classic Collection');
    expect(displaySetName('Zenit der Könige')).toBe('Zenit der Könige');
  });

  it('nimmt für englische Sets das englische Bild und pokemontcg.io, für japanische nur TCGdex', () => {
    const en = { image: 'https://assets.tcgdex.net/en/base/base1/4', localId: '4' };
    expect(catalogCardImageSources('en', en, 'base1').map((s) => s.url)).toEqual([
      'https://assets.tcgdex.net/en/base/base1/4/low.webp',
      'https://images.pokemontcg.io/base1/4.png',
    ]);
    const ja = { image: 'https://assets.tcgdex.net/ja/SV/SV2a/201', localId: '201' };
    expect(catalogCardImageSources('ja', ja, 'SV2a', 'high')).toEqual([
      { url: 'https://assets.tcgdex.net/ja/SV/SV2a/201/high.webp', lang: 'ja' },
    ]);
    expect(catalogCardImageSources('ja', { localId: '1' }, 'SV2a')).toEqual([]);
  });

  it('zeigt für japanische Sets kein englisches Ersatzlogo', () => {
    expect(setLogoSources({ id: 'SV2a', symbol: 'https://assets.tcgdex.net/univ/SV/SV2a/symbol' }, 'SV', 'ja')).toEqual([
      { url: 'https://assets.tcgdex.net/univ/SV/SV2a/symbol.webp', lang: 'ja' },
    ]);
  });
});

describe('Englische Namen japanischer Sets', () => {
  it('zeigt den englischen Namen und behält den japanischen', () => {
    expect(localizeSet({ id: 'SV2a', name: 'ポケモンカード151' }, 'ja')).toEqual({
      id: 'SV2a',
      name: 'Pokémon Card 151',
      originalName: 'ポケモンカード151',
    });
  });

  it('lässt Sets ohne Eintrag und andere Sprachen unverändert', () => {
    expect(localizeSet({ id: 'CS1a', name: 'トリプレットビート' }, 'ja')).toEqual({ id: 'CS1a', name: 'トリプレットビート' });
    // Dieselbe Kennung in einer anderen Sprache bekommt keinen Namen aus der japanischen Tabelle.
    expect(localizeSet({ id: 'SV2a', name: 'Something' }, 'en').name).toBe('Something');
    expect(localizeSet({ id: 'cel25c', name: 'Celebrations Klassische Kollektion' }, 'de').name).toBe(
      'Celebrations Classic Collection'
    );
  });

  it('liefert für die Setliste englischen Namen, japanischen Namen und Cardmarket-Schreibweisen', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => [
            { id: 'SV8a', name: 'テラスタルフェスex' },
            { id: 'CS1a', name: 'トリプレットビート' },
          ],
        }) as Response
    );
    expect(await fetchSetList('ja')).toEqual([
      { id: 'SV8a', names: ['Terastal Fest ex', 'テラスタルフェスex', 'Terastal Festival ex'] },
      { id: 'CS1a', names: ['トリプレットビート'] },
    ]);
    fetchMock.mockRestore();
  });
});
