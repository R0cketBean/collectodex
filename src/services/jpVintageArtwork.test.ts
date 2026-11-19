import { describe, expect, it } from 'vitest';
import { JP_VINTAGE_SETS, englishArtworks } from './jpVintageArtwork';

describe('englishArtworks', () => {
  it('findet das englische Gegenstück einer japanischen Vintage-Karte', () => {
    // PMCG1-021 = リザードン aus dem japanischen Grundset = Base Set Glurak.
    expect(englishArtworks('PMCG1-021')).toEqual([
      {
        cardId: 'base1-4',
        setId: 'base1',
        localId: '4',
        serieId: 'base',
        image: 'https://assets.tcgdex.net/en/base/base1/4',
      },
    ]);
  });

  it('kennt Aquapolis- und Skyridge-Karten mit H-Nummern', () => {
    const all = JP_VINTAGE_SETS.flatMap((set) =>
      Array.from({ length: 160 }, (_, i) => englishArtworks(`${set}-${String(i + 1).padStart(3, '0')}`)).flat()
    );
    expect(all.some((c) => c.localId.startsWith('H') && c.serieId === 'ecard')).toBe(true);
    expect(all.every((c) => c.serieId !== undefined)).toBe(true);
  });

  it('liefert nichts für Karten außerhalb der Tabelle', () => {
    expect(englishArtworks('SV2a-006')).toEqual([]);
  });

  it('deckt Grundset bis e-Serie ab', () => {
    expect(JP_VINTAGE_SETS).toEqual(expect.arrayContaining(['PMCG1', 'PMCG6', 'neo1', 'neo4', 'E1', 'E5']));
  });
});
