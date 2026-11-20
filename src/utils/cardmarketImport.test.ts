import { describe, expect, it, vi } from 'vitest';
import type { CardmarketOrder, CardmarketOrderLine } from '../services/cardmarketOrder';
import { DEFAULT_CATEGORIES, type Category, type CollectionItem } from '../types/models';
import {
  applyImport,
  normalizeNumber,
  orderValues,
  planImport,
  sealedKey,
  sealedType,
  resolveCatalogCard,
  type CatalogLookup,
} from './cardmarketImport';

const categories = DEFAULT_CATEGORIES.map((c) => ({ ...c, createdAt: new Date(), updatedAt: new Date() })) as Category[];
const singles = categories.find((c) => c.id === 'singles')!;

const line = (patch: Partial<CardmarketOrderLine> = {}): CardmarketOrderLine => ({
  section: 'Pokémon Einzelkarten',
  kind: 'single',
  quantity: 1,
  name: 'Nidoking',
  number: '11',
  language: 'DE',
  condition: 'EX',
  setCode: 'BS',
  unitPrice: 2.5,
  ...patch,
});

// „BS“ gehört bei TCGdex zu Grundset und Kampfstile.
const lookup: CatalogLookup = {
  setsByCode: vi.fn(async () => [
    { id: 'base1', name: 'Grundset' },
    { id: 'swsh5', name: 'Kampfstile' },
  ]),
  setCards: vi.fn(async (setId: string) =>
    setId === 'base1'
      ? { name: 'Grundset', cards: [{ id: 'base1-11', localId: '11', name: 'Nidoking' }, { id: 'base1-46', localId: '46', name: 'Glumanda' }] }
      : { name: 'Kampfstile', cards: [{ id: 'swsh5-11', localId: '011', name: 'Bisaflor' }] }
  ),
};

const item = (patch: Partial<CollectionItem>): CollectionItem => ({
  id: 'item_1',
  categoryId: 'singles',
  values: { name: 'Nidoking', quantity: 1, purchasePrice: 0, currentValue: 3, language: 'deutsch' },
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...patch,
});

const order = (lines: CardmarketOrderLine[]): CardmarketOrder => ({
  orderId: '72300505',
  date: '2019-03-27',
  currency: 'EUR',
  lines,
});

describe('resolveCatalogCard', () => {
  it('nimmt bei mehrdeutigem Set-Kürzel das Set, in dem Nummer und Name passen', async () => {
    const hit = await resolveCatalogCard(line(), lookup);
    expect(hit).toMatchObject({ cardId: 'base1-11', setName: 'Grundset', lang: 'de', status: 'sure' });
  });

  it('meldet keinen Treffer ohne Nummer', async () => {
    expect(await resolveCatalogCard(line({ number: undefined }), lookup)).toBeNull();
  });

  it('vergleicht Nummern ohne führende Nullen', () => {
    expect(normalizeNumber('011')).toBe('11');
    expect(normalizeNumber('tg05')).toBe('TG5');
  });
});

describe('planImport', () => {
  it('schlägt Anlegen, Kaufpreis eintragen und Überspringen passend vor', async () => {
    const items = [
      item({ id: 'a', catalog: { cardId: 'base1-11', setId: 'base1' } }),
      item({ id: 'b', values: { name: 'Glumanda', quantity: 1, purchasePrice: 0.2 }, catalog: { cardId: 'base1-46', setId: 'base1' } }),
    ];
    const rows = await planImport(
      [order([line(), line({ name: 'Glumanda', number: '46', unitPrice: 0.1 }), line({ name: 'Unbekannt', number: '99' })])],
      items,
      categories,
      lookup
    );
    expect(rows.map((r) => [r.action, r.existing?.id ?? null])).toEqual([
      ['setPrice', 'a'],
      ['skip', 'b'],
      ['create', null],
    ]);
    expect(rows[1].note).toMatch(/Kaufpreis/);
    expect(rows[2].hit).toBeNull();
  });

  it('findet nicht verknüpfte Einträge über Set-Kürzel und Nummer im Cardmarket-Link', async () => {
    const link = (url: string) => ({ product: `https://www.cardmarket.com/de/Pokemon/Products/Singles/${url}` });
    const items = [
      item({ id: 'other', values: { name: 'Vulnona', quantity: 1, purchasePrice: 0, language: 'Deutsch', expansion: 'Dschungel' } }),
      item({ id: 'base', values: { name: 'Vulnona', quantity: 1, purchasePrice: 0, language: 'Deutsch', expansion: 'Basis' }, links: link('Base-Set/Ninetales-V1-BS12?isFirstEd=Y') }),
      item({ id: 'promo', values: { name: 'Glumanda', quantity: 1, purchasePrice: 9, language: 'Deutsch', expansion: '151' }, links: link('151/Charmander-V2-MEW168') }),
    ];
    const rows = await planImport(
      [order([line({ name: 'Vulnona', number: '12' }), line({ name: 'Glumanda', number: '46' })])],
      items,
      categories,
      lookup
    );
    expect(rows[0]).toMatchObject({ action: 'setPrice', existing: { id: 'base' } });
    expect(rows[0].note).toMatch(/1\. Edition/);
    expect(rows[1]).toMatchObject({ action: 'create', existing: null });
  });

  it('überspringt Zeilen aus einer schon übernommenen Bestellung', async () => {
    const items = [item({ catalog: { cardId: 'base1-11', setId: 'base1' }, purchaseOrders: ['72300505'] })];
    const [row] = await planImport([order([line()])], items, categories, lookup);
    expect(row.action).toBe('skip');
  });

  it('legt Sealed-Artikel in „Sealed Produkte“ an', async () => {
    const [row] = await planImport(
      [order([line({ kind: 'sealed', section: 'Pokémon Booster', name: 'Booster', number: undefined, setCode: undefined })])],
      [],
      categories,
      lookup
    );
    expect(row).toMatchObject({ categoryId: 'sealed', action: 'create' });
  });
});

describe('orderValues', () => {
  it('übernimmt Menge, Artikelpreis, Datum, Sprache und Zustand', () => {
    const values = orderValues(singles, { line: line({ quantity: 2, condition: 'NM' }), date: '2019-03-27', hit: null });
    expect(values).toMatchObject({
      name: 'Nidoking',
      quantity: 2,
      purchasePrice: 2.5,
      currentValue: 2.5,
      addedDate: '2019-03-27',
      language: 'deutsch',
      condition: 'Near Mint',
      expansion: 'BS',
    });
  });
});

describe('applyImport', () => {
  it('setzt Kaufpreise, mittelt bei mehr Exemplaren und legt neue Einträge an', async () => {
    const items = [
      item({ id: 'a', catalog: { cardId: 'base1-11', setId: 'base1' } }),
      item({ id: 'b', values: { name: 'Glumanda', quantity: 1, purchasePrice: 0.3 }, catalog: { cardId: 'base1-46', setId: 'base1' } }),
    ];
    const rows = await planImport(
      [order([line(), line({ name: 'Glumanda', number: '46', unitPrice: 0.1 }), line({ name: 'Neu', number: '99' })])],
      items,
      categories,
      lookup
    );
    rows[1].action = 'addQuantity';
    const drafts = new Map([[rows[2].key, { values: orderValues(singles, rows[2]) }]]);
    const result = applyImport(items, rows, drafts, new Date('2026-11-20'));

    expect(result).toMatchObject({ created: 1, updated: 2 });
    const [a, b, created] = result.items;
    expect(a.values).toMatchObject({ purchasePrice: 2.5, addedDate: '2019-03-27' });
    expect(a.purchaseOrders).toEqual(['72300505']);
    expect(b.values).toMatchObject({ quantity: 2, purchasePrice: 0.2 });
    expect(created).toMatchObject({ categoryId: 'singles', purchaseOrders: ['72300505'] });
    expect(created.values).toMatchObject({ name: 'Neu', purchasePrice: 2.5 });
    expect(items[0].values.purchasePrice).toBe(0);
  });
});

describe('Sealed-Artikel', () => {
  const sealedLine = line({
    kind: 'sealed',
    section: 'Pokémon Elite Trainer Boxes',
    name: 'Farbenschock Top-Trainer-Box',
    number: undefined,
    condition: undefined,
    setCode: 'VIV',
    unitPrice: 75.99,
  });

  it('erkennt gleiche Produkte trotz anderer Schreibweise', async () => {
    expect(sealedKey('ETB Farbenschock')).toBe(sealedKey('Farbenschock Top-Trainer-Box'));
    expect(sealedKey('Fatale Flammen Booster Bundle')).toBe(sealedKey('Fatale Flammen Boosterbundle'));
    expect(sealedKey('ETB Fatale Flammen Pokémon Center')).not.toBe(sealedKey('Fatale Flammen Top-Trainer-Box'));

    const etb = (id: string, name: string, purchasePrice: number) =>
      item({ id, categoryId: 'sealed', values: { name, quantity: 1, purchasePrice, language: 'Deutsch', category: 'Elite Trainer Box' } });
    const [row] = await planImport(
      [order([sealedLine])],
      [etb('other', 'ETB Drachenwandel', 59.99), etb('vivid', 'ETB Farbenschock', 75.99)],
      categories,
      lookup
    );
    expect(row).toMatchObject({ action: 'skip', existing: { id: 'vivid' } });
    expect(row.note).toMatch(/stimmt schon/);
  });

  it('füllt die Produktart aus dem Abschnitt', () => {
    const sealed = categories.find((c) => c.id === 'sealed')!;
    expect(orderValues(sealed, { line: sealedLine, date: '2021-01-19', hit: null })).toMatchObject({
      name: 'Farbenschock Top-Trainer-Box',
      category: 'Elite Trainer Box',
      language: 'deutsch',
      purchasePrice: 75.99,
    });
    expect(sealedType('Pokémon Tins', 'Kanto Power Mini Tins: Mew')).toBe('Mini Tin Box');
  });
});
