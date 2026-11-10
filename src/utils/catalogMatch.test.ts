import { describe, expect, it } from 'vitest';
import type { CollectionItem } from '../types/models';
import { candidateSetIds, findSetIds, parseCardmarketLink, suggestMatch } from './catalogMatch';

const item = (values: Record<string, unknown>, product?: string): CollectionItem =>
  ({
    id: 'i',
    categoryId: 'singles',
    values,
    ...(product ? { links: { product } } : {}),
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as CollectionItem;

const CM = 'https://www.cardmarket.com/de/Pokemon/Products/Singles';
const sets = [
  { id: 'base1', names: ['Grundset', 'Base Set'] },
  { id: 'sv03.5', names: ['151', '151'] },
  { id: 'swsh12.5', names: ['Zenit der Könige', 'Crown Zenith'] },
];
const base1 = [
  { id: 'base1-2', localId: '2', name: 'Turtok' },
  { id: 'base1-4', localId: '4', name: 'Glurak' },
  { id: 'base1-46', localId: '46', name: 'Glumanda' },
];
const s151 = [
  { id: 'sv03.5-006', localId: '006', name: 'Glurak-ex' },
  { id: 'sv03.5-183', localId: '183', name: 'Glurak-ex' },
  { id: 'sv03.5-001', localId: '001', name: 'Bisasam' },
];

describe('parseCardmarketLink', () => {
  it('liest Set und Nummer', () => {
    expect(parseCardmarketLink(`${CM}/Base-Set/Charizard-V1-BS4?language=3`)).toEqual({ setSlug: 'Base-Set', number: '4' });
    expect(parseCardmarketLink(`${CM}/151/Charizard-ex-MEW006`)).toEqual({ setSlug: '151', number: '6' });
    expect(parseCardmarketLink(`${CM}/Crown-Zenith/Mewtwo-VSTAR-GG44`)?.number).toBe('44');
  });

  it('hält eine reine Versionsangabe nicht für die Nummer', () => {
    expect(parseCardmarketLink(`${CM}/Base-Set/Charizard-V1`)).toEqual({ setSlug: 'Base-Set', number: null });
  });

  it('liefert null für alles, was kein Einzelkarten-Link ist', () => {
    expect(parseCardmarketLink(undefined)).toBeNull();
    expect(parseCardmarketLink('https://www.cardmarket.com/de/Pokemon/Products/Tins/Foo')).toBeNull();
  });
});

describe('Sets finden', () => {
  it('vergleicht deutsche und englische Namen ohne Rücksicht auf Schreibweise', () => {
    expect(findSetIds(sets, 'Base-Set')).toEqual(['base1']);
    expect(findSetIds(sets, 'zenit der koenige')).toEqual([]);
    expect(findSetIds(sets, 'Zenit der Könige')).toEqual(['swsh12.5']);
    expect(findSetIds(sets, '')).toEqual([]);
  });

  it('nimmt Link und Erweiterung zusammen', () => {
    expect(candidateSetIds(sets, item({ expansion: '151' }, `${CM}/Base-Set/Charizard-V1-BS4`))).toEqual(['base1', 'sv03.5']);
    expect(candidateSetIds(sets, item({ expansion: 'Tag All Stars' }))).toEqual([]);
  });
});

describe('suggestMatch', () => {
  const cards = { base1, 'sv03.5': s151 };

  it('ist sicher, wenn Nummer und Name übereinstimmen', () => {
    const s = suggestMatch(item({ name: 'Glurak' }, `${CM}/Base-Set/Charizard-V1-BS4`), ['base1'], cards);
    expect(s.status).toBe('sure');
    expect(s.best?.card.id).toBe('base1-4');
  });

  it('unterscheidet gleichnamige Karten über die Nummer', () => {
    const s = suggestMatch(item({ name: 'Glurak ex' }, `${CM}/151/Charizard-ex-MEW183`), ['sv03.5'], cards);
    expect(s).toMatchObject({ status: 'sure', best: { card: { id: 'sv03.5-183' } } });
  });

  it('legt zur Prüfung vor, wenn die Nummer passt, der Name aber nicht', () => {
    const s = suggestMatch(item({ name: 'Charizard' }, `${CM}/Base-Set/Charizard-V1-BS4`), ['base1'], cards);
    expect(s.status).toBe('review');
    expect(s.best?.card.id).toBe('base1-4');
    expect(s.reason).toBe('Nummer passt, Name weicht ab');
  });

  it('ist ohne Nummer nur bei eindeutigem Namen sicher', () => {
    expect(suggestMatch(item({ name: 'Bisasam' }), ['sv03.5'], cards).status).toBe('sure');
    const ambiguous = suggestMatch(item({ name: 'Glurak-ex' }), ['sv03.5'], cards);
    expect(ambiguous.status).toBe('review');
    expect(ambiguous.candidates).toHaveLength(2);
  });

  it('übernimmt japanische Karten nie von selbst', () => {
    const s = suggestMatch(item({ name: 'Glurak', language: 'Japanisch' }, `${CM}/Base-Set/Charizard-BS4`), ['base1'], cards);
    expect(s.status).toBe('review');
  });

  it('meldet keinen Treffer, wenn Set oder Karte fehlen', () => {
    expect(suggestMatch(item({ name: 'Glurak' }), [], cards).status).toBe('none');
    expect(suggestMatch(item({ name: 'Mewtu' }), ['base1'], cards).status).toBe('none');
    expect(suggestMatch(item({ name: 'Glurak' }), ['unbekannt'], cards).status).toBe('none');
  });
});
