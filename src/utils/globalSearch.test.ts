import { describe, expect, it } from 'vitest';
import type { Category, CollectionItem } from '../types/models';
import { buildSearchIndex, normalizeSearch, searchEntries } from './globalSearch';

const category = (id: string, name: string, extra: [string, string, 'text' | 'dropdown' | 'number'][] = []): Category =>
  ({
    id,
    name,
    order: 0,
    attributes: [
      { id: 'name', name: 'Name', type: 'text', required: true, order: 0 },
      ...extra.map(([attrId, attrName, type], i) => ({ id: attrId, name: attrName, type, required: false, order: i + 1 })),
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as Category;

const item = (id: string, categoryId: string, values: Record<string, unknown>): CollectionItem =>
  ({ id, categoryId, values, createdAt: new Date(), updatedAt: new Date() }) as CollectionItem;

const categories = [
  category('singles', 'Einzelkarten', [
    ['expansion', 'Erweiterung', 'text'],
    ['condition', 'Zustand', 'dropdown'],
    ['notes', 'Zählwert', 'number'],
  ]),
  category('sealed', 'Sealed Produkte', [['category', 'Produktart', 'dropdown']]),
];

const items = [
  item('1', 'singles', { name: 'Glurak ex', expansion: '151', condition: 'Near Mint', notes: 7 }),
  item('2', 'singles', { name: 'Mega-Glurak', expansion: 'Flammenmeer', condition: 'PSA 10' }),
  item('3', 'sealed', { name: 'Pokémon 151 Display', category: 'Display' }),
  item('4', 'sealed', { name: 'Glurak Kollektion', category: 'Box' }),
  item('5', 'singles', { name: 'Evoli', expansion: 'Glurak-Promo' }),
  item('6', 'weg', { name: 'Glurak ohne Kategorie' }),
];

const index = buildSearchIndex(items, categories);
const ids = (query: string, limit?: number) => searchEntries(index, query, limit).hits.map((hit) => hit.item.id);

describe('normalizeSearch', () => {
  it('ignoriert Großschreibung, Akzente und ß', () => {
    expect(normalizeSearch('  Pokémon ')).toBe('pokemon');
    expect(normalizeSearch('Straße')).toBe('strasse');
  });
});

describe('searchEntries', () => {
  it('findet über alle Kategorien und lässt Einträge ohne Kategorie aus', () => {
    expect(ids('glurak')).toEqual(['1', '4', '2', '5']);
  });

  it('stellt Namensanfang vor Wortanfang, Wortmitte und andere Felder', () => {
    // 1 und 4 beginnen mit dem Suchwort, 2 enthält es als Wortanfang nach dem Bindestrich, 5 nur in der Erweiterung.
    expect(ids('glurak').slice(-1)).toEqual(['5']);
    expect(ids('glurak ex')[0]).toBe('1');
  });

  it('verlangt alle Wörter, auch über mehrere Felder verteilt', () => {
    expect(ids('glurak psa')).toEqual(['2']);
    expect(ids('glurak turtok')).toEqual([]);
  });

  it('nennt das Feld, in dem der Treffer außerhalb des Namens liegt', () => {
    const [hit] = searchEntries(index, 'glurak psa').hits;
    expect(hit.matched).toEqual({ label: 'Zustand', value: 'PSA 10' });
    expect(searchEntries(index, 'glurak ex').hits[0].matched).toBeUndefined();
  });

  it('findet ohne Akzent und durchsucht keine Zahlenfelder', () => {
    expect(ids('pokemon')).toEqual(['3']);
    expect(ids('7')).toEqual([]);
  });

  it('begrenzt die Liste und zählt trotzdem alle Treffer', () => {
    const result = searchEntries(index, 'glurak', 2);
    expect(result.hits).toHaveLength(2);
    expect(result.total).toBe(4);
  });

  it('liefert ohne Suchwort nichts', () => {
    expect(searchEntries(index, '   ')).toEqual({ hits: [], total: 0 });
  });
});
