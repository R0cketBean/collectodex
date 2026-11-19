import { describe, expect, it, vi } from 'vitest';

vi.mock('./tcgdex', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./tcgdex')>()),
  fetchExcludedSetIds: vi.fn(async () => new Set(['A1', 'P-A'])),
  fetchSetSummaries: vi.fn(async () => [
    { id: 'sv01', name: 'Karmesin & Purpur', cardCount: { total: 258, official: 198 } },
    { id: 'A1', name: 'Unschlagbare Gene', cardCount: { total: 286, official: 226 } },
  ]),
  fetchSetsByCode: vi.fn(async () => [{ id: 'A1', name: 'Unschlagbare Gene' }]),
  searchCardsByName: vi.fn(async () => [
    { id: 'base1-58', localId: '58', name: 'Pikachu' },
    { id: 'A1-094', localId: '094', name: 'Pikachu' },
    { id: 'A1a-025', localId: '025', name: 'Pikachu' },
    { id: 'P-A-009', localId: '009', name: 'Pikachu' },
  ]),
}));

const { tcgdexSource } = await import('./cardScan');
const tcgdex = await import('./tcgdex');

describe('tcgdexSource', () => {
  it('lässt Pokémon TCG Pocket aus Set- und Namenssuche weg', async () => {
    const source = tcgdexSource('de');
    expect((await source.allSets()).map((s) => s.id)).toEqual(['sv01']);
    expect(await source.setsByCode('A1')).toEqual([]);
    // „A1a“ ist ein eigenes Set und hier bewusst nicht ausgeschlossen.
    expect((await source.cardsByName('Pikachu')).map((c) => c.id)).toEqual(['base1-58', 'A1a-025']);
    // Die ausgeschlossenen Sets werden je Quelle nur einmal abgefragt.
    expect(tcgdex.fetchExcludedSetIds).toHaveBeenCalledTimes(1);
  });

  it('sucht weiter, wenn die Pocket-Serie nicht abrufbar ist', async () => {
    vi.mocked(tcgdex.fetchExcludedSetIds).mockRejectedValueOnce(new Error('offline'));
    expect(await tcgdexSource('ja').cardsByName('Pikachu')).toHaveLength(4);
  });
});
