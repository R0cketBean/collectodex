import { describe, expect, it, vi } from 'vitest';
import { findScanCandidates, type CatalogSource } from './cardScan';
import type { VisualCard, VisualMatcher } from './imageMatch';
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
  describe('mit Bildvergleich (#170)', () => {
    // Base Set (102 Karten) und Base Set 2 (130) mit demselben Glurak-Artwork.
    const OLD: SetDetail[] = [
      set('base1', 'Grundset', 102, [['1', 'Simsala'], ['2', 'Turtok'], ['4', 'Glurak']]),
      set('base4', 'Base Set 2', 130, [['4', 'Glurak'], ['5', 'Simsala']]),
      set('neo1', 'Neo Genesis', 111, [['9', 'Glurak']]),
    ];
    const oldSource = () =>
      source({
        setsByCode: vi.fn(async () => []),
        allSets: vi.fn(async () => OLD.map(brief)),
        set: vi.fn(async (id: string) => OLD.find((s) => s.id === id)!),
        cardsByName: vi.fn(async (name: string) => OLD.flatMap((s) => s.cards).filter((c) => c.name === name)),
      });
    /** Bildabstand je Karte; nicht genannte Karten zeigen ein anderes Motiv. */
    const matcher = (near: Record<string, number>): VisualMatcher & { calls: VisualCard[] } => {
      const calls: VisualCard[] = [];
      return {
        calls,
        distance: async (card) => {
          calls.push(card);
          return near[card.cardId] ?? 0.4;
        },
      };
    };

    it('vergleicht nicht, wenn der Text schon sicher ist', async () => {
      const visual = matcher({});
      const { candidates } = await findScanCandidates(
        { setCode: 'SVI', number: '123', total: 198, name: 'Riesenzahn ex' },
        source(),
        visual
      );
      expect(candidates[0].cardId).toBe('sv01-123');
      expect(visual.calls).toHaveLength(0);
    });

    it('findet die Karte über das Bild, wenn nur die Set-Größe lesbar war', async () => {
      const visual = matcher({ 'base1-2': 0.07 });
      const { candidates } = await findScanCandidates({ total: 102 }, oldSource(), visual);
      expect(candidates.map((c) => c.cardId)).toEqual(['base1-2']);
      expect(candidates[0].matches).toEqual(['total', 'image']);
      expect(visual.calls.map((c) => c.cardId).sort()).toEqual(['base1-1', 'base1-2', 'base1-4']);
    });

    it('liefert nichts, wenn bei unlesbarer Nummer kein Bild passt', async () => {
      const { candidates } = await findScanCandidates({ total: 102 }, oldSource(), matcher({}));
      expect(candidates).toEqual([]);
    });

    it('holt unter gleichnamigen Karten die mit dem passenden Artwork nach vorn', async () => {
      const many = Array.from({ length: 12 }, (_, i) =>
        set(`x${i}`, `Set ${i}`, 50 + i, [['1', 'Glurak']])
      );
      const all = [...OLD, ...many];
      const src = source({
        setsByCode: vi.fn(async () => []),
        allSets: vi.fn(async () => all.map(brief)),
        set: vi.fn(async (id: string) => all.find((s) => s.id === id)!),
        // Die Suche liefert das gesuchte Glurak erst ganz hinten.
        cardsByName: vi.fn(async () => [...many, ...OLD].flatMap((s) => s.cards).filter((c) => c.name === 'Glurak')),
      });
      const { candidates } = await findScanCandidates({ name: 'Glurak' }, src, matcher({ 'neo1-9': 0.05 }));
      expect(candidates[0]).toMatchObject({ cardId: 'neo1-9', matches: ['name', 'image'] });
      // Ohne Bildvergleich wäre es gar nicht unter den geladenen Sets.
      const { candidates: plain } = await findScanCandidates({ name: 'Glurak' }, src);
      expect(plain.map((c) => c.cardId)).not.toContain('neo1-9');
    });

    it('übergibt die Serie, damit das englische Bild gefunden wird', async () => {
      const visual = matcher({ 'base1-4': 0.05 });
      await findScanCandidates({ number: '4', name: 'Glurak' }, oldSource(), visual);
      expect(visual.calls.find((c) => c.cardId === 'base1-4')).toMatchObject({ setId: 'base1', localId: '4', serieId: 'sv' });
    });

    it('übersteht einen Fehler beim Bildvergleich', async () => {
      const broken: VisualMatcher = { distance: async () => Promise.reject(new Error('kein Netz')) };
      const { candidates } = await findScanCandidates({ number: '4', total: 102 }, oldSource(), broken);
      expect(candidates[0]).toMatchObject({ cardId: 'base1-4', matches: ['number', 'total'] });
    });
  });
});
