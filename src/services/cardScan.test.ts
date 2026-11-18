import { describe, expect, it, vi } from 'vitest';
import { findScanCandidates, type CatalogSource } from './cardScan';
import type { CardBrief, SetBrief, SetDetail } from './tcgdex';

const set = (id: string, name: string, official: number, cards: Array<[string, string]>, code?: string): SetDetail => ({
  id,
  name,
  cardCount: { total: official, official },
  serie: { id: 'sv', name: 'Serie' },
  abbreviation: code ? { official: code } : undefined,
  cards: cards.map(([localId, cardName]) => ({ id: `${id}-${localId}`, localId, name: cardName })),
});

const SETS: SetDetail[] = [
  set('sv01', 'Karmesin & Purpur', 198, [['123', 'Riesenzahn-ex'], ['139', 'Forstellka']], 'SVI'),
  set('swsh6', 'Schaurige Herrschaft', 198, [['123', 'Pottrott']]),
  set('swsh12', 'Silberne Sturmwinde', 195, [['139', 'Lugia-VSTAR']]),
  set('sv03.5', '151', 165, [['006', 'Glurak-ex']], 'MEW'),
];

const brief = (s: SetDetail): SetBrief => ({ id: s.id, name: s.name, cardCount: s.cardCount });

const source = (overrides: Partial<CatalogSource> = {}): CatalogSource => ({
  setsByCode: vi.fn(async (code: string) => SETS.filter((s) => s.abbreviation?.official === code).map(brief)),
  allSets: vi.fn(async () => SETS.map(brief)),
  set: vi.fn(async (id: string) => {
    const found = SETS.find((s) => s.id === id);
    if (!found) throw new Error('unbekannt');
    return found;
  }),
  cardsByName: vi.fn(async (name: string): Promise<CardBrief[]> =>
    SETS.flatMap((s) => s.cards).filter((c) => c.name.toLowerCase().includes(name.toLowerCase()))
  ),
  ...overrides,
});

describe('findScanCandidates', () => {
  it('findet die Karte über den Set-Code, ohne alle Sets zu laden', async () => {
    const src = source();
    const { candidates: ranked } = await findScanCandidates({ setCode: 'SVI', number: '123', total: 198, name: 'Riesenzahn ex' }, src);
    expect(ranked[0]).toMatchObject({ cardId: 'sv01-123', setName: 'Karmesin & Purpur' });
    expect(ranked[0].matches).toEqual(['code', 'number', 'total', 'name']);
    expect(src.allSets).not.toHaveBeenCalled();
  });

  it('grenzt ohne Set-Code über die Gesamtzahl ein; der Name entscheidet', async () => {
    const { candidates: ranked } = await findScanCandidates({ number: '123', total: 198, name: 'Pottrott' }, source());
    expect(ranked.map((r) => r.cardId)).toEqual(['swsh6-123', 'sv01-123']);
  });

  it('weicht auf die Gesamtzahl aus, wenn der Set-Code unbekannt ist', async () => {
    const { candidates: ranked } = await findScanCandidates({ setCode: 'XYZ', number: '139', total: 195 }, source());
    expect(ranked[0].cardId).toBe('swsh12-139');
  });

  it('entfernt ein mitgelesenes Regulierungszeichen vor dem Set-Code', async () => {
    const { candidates: ranked } = await findScanCandidates({ setCode: 'GMEW', number: '6', total: 165 }, source());
    expect(ranked[0]).toMatchObject({ cardId: 'sv03.5-006' });
    expect(ranked[0].matches).toContain('code');
    expect((await findScanCandidates({ setCode: 'GMEW', number: '6' }, source())).info.setCode).toBe('MEW');
  });

  it('sucht über den Namen, wenn weder Code noch Gesamtzahl passen', async () => {
    const { candidates: ranked } = await findScanCandidates({ name: 'Glurak' }, source());
    expect(ranked[0]).toMatchObject({ cardId: 'sv03.5-006', setId: 'sv03.5', official: 165 });
  });

  it('zeigt namensgleiche Karten, wenn die gelesene Nummer im Katalog fehlt', async () => {
    const { candidates: ranked } = await findScanCandidates({ setCode: 'MEP', number: '116', name: 'Glurak' }, source());
    expect(ranked.map((r) => r.cardId)).toEqual(['sv03.5-006']);
    expect(ranked[0].matches).toEqual(['name']);
  });

  it('liefert nichts, wenn der Katalog nicht erreichbar ist', async () => {
    const offline = source({
      setsByCode: async () => Promise.reject(new Error('offline')),
      allSets: async () => Promise.reject(new Error('offline')),
      cardsByName: async () => Promise.reject(new Error('offline')),
    });
    expect((await findScanCandidates({ setCode: 'SVI', number: '1', total: 198, name: 'X' }, offline)).candidates).toEqual([]);
  });
});
