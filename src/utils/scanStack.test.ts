import { describe, expect, it } from 'vitest';
import {
  addToStack,
  parseStack,
  setPrice,
  setQuantity,
  setVariant,
  stackTotals,
  unitPrice,
  type NewStackEntry,
  type StackEntry,
} from './scanStack';

const card = (cardId: string, extra: Partial<NewStackEntry> = {}): NewStackEntry => ({
  cardId,
  setId: cardId.split('-')[0],
  setName: 'Set',
  localId: cardId.split('-')[1],
  name: `Karte ${cardId}`,
  lang: 'de',
  variant: 'normal',
  ...extra,
});
const price = (trend: number | null, reverseTrend: number | null = null) => ({
  trend,
  low: null,
  avg30: null,
  reverseTrend,
  reverseLow: null,
  idProduct: null,
});

describe('addToStack', () => {
  it('legt neue Karten vorn an und zählt gleiche zusammen', () => {
    let s: StackEntry[] = [];
    s = addToStack(s, card('sv01-1'));
    s = addToStack(s, card('sv01-2'));
    s = addToStack(s, card('sv01-1'));
    expect(s.map((e) => [e.cardId, e.quantity])).toEqual([
      ['sv01-1', 2],
      ['sv01-2', 1],
    ]);
  });

  it('trennt nach Fassung und Sprache', () => {
    let s: StackEntry[] = [];
    s = addToStack(s, card('sv01-1'));
    s = addToStack(s, card('sv01-1', { variant: 'reverse' }));
    s = addToStack(s, card('sv01-1', { lang: 'en' }));
    expect(s).toHaveLength(3);
  });
});

describe('Anpassen', () => {
  const base = addToStack(addToStack([], card('sv01-1')), card('sv01-1', { variant: 'reverse' }));

  it('setzt die Anzahl und entfernt bei 0', () => {
    const key = base[1].key;
    expect(setQuantity(base, key, 4).find((e) => e.key === key)?.quantity).toBe(4);
    expect(setQuantity(base, key, 0)).toHaveLength(1);
  });

  it('legt beim Wechsel der Fassung gleiche Karten zusammen', () => {
    const normal = base.find((e) => e.variant === 'normal')!;
    const merged = setVariant(base, normal.key, 'reverse');
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ variant: 'reverse', quantity: 2 });
  });

  it('ändert nur die Fassung, wenn es keine gleiche Karte gibt', () => {
    const one = addToStack([], card('sv01-5'));
    expect(setVariant(one, one[0].key, 'reverse')[0]).toMatchObject({ variant: 'reverse', key: 'de:sv01-5:reverse' });
  });

  it('trägt Preise für alle Fassungen der Karte nach', () => {
    const priced = setPrice(base, 'sv01-1', 'de', price(0.1, 0.3), true);
    expect(priced.every((e) => e.price?.trend === 0.1 && e.hasReverse)).toBe(true);
  });
});

describe('Preise und Summe', () => {
  it('nimmt für Reverse den Reverse-Preis, sonst den normalen', () => {
    expect(unitPrice({ variant: 'reverse', price: price(0.1, 0.3) })).toBe(0.3);
    expect(unitPrice({ variant: 'reverse', price: price(0.1, null) })).toBe(0.1);
    expect(unitPrice({ variant: 'normal', price: undefined })).toBeNull();
  });

  it('rechnet nach der eingestellten Preisbasis', () => {
    const p = { trend: 0.02, low: 0.02, avg30: 0.06, reverseTrend: 0.07, reverseLow: 0.02, idProduct: null };
    expect(unitPrice({ variant: 'reverse', price: p }, 'trend')).toBe(0.07);
    expect(unitPrice({ variant: 'reverse', price: p }, 'low')).toBe(0.02);
    expect(unitPrice({ variant: 'normal', price: p }, 'avg30')).toBe(0.06);
    const s = addToStack([], card('me06-052', { variant: 'reverse', quantity: 3, price: p }));
    expect(stackTotals(s, 'low').value).toBe(0.06);
    expect(stackTotals(s, 'trend').value).toBe(0.21);
  });

  it('summiert Trendpreise mal Anzahl und zählt Karten ohne Preis', () => {
    let s = addToStack([], card('sv01-1', { quantity: 3, price: price(0.1) }));
    s = addToStack(s, card('sv01-2', { variant: 'reverse', price: price(0.1, 0.31) }));
    s = addToStack(s, card('sv01-3', { price: null }));
    expect(stackTotals(s)).toEqual({ cards: 5, value: 0.61, unpriced: 1 });
  });
});

describe('parseStack', () => {
  it('stellt einen gespeicherten Stapel wieder her und verwirft Unbrauchbares', () => {
    const saved = JSON.parse(JSON.stringify(addToStack([], card('sv01-1', { quantity: 2, price: price(1) }))));
    expect(parseStack([...saved, null, { cardId: 'x' }, 'kaputt'])).toEqual(saved);
    expect(parseStack('nichts')).toEqual([]);
  });
});
