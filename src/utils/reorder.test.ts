import { describe, it, expect } from 'vitest';
import { sortByOrder, moveInArray, moveAndRenumber } from './reorder';

const items = (orders: number[]) =>
  orders.map((order, i) => ({ id: `id${i}`, order }));

describe('sortByOrder', () => {
  it('sortiert nach order ohne die Eingabe zu mutieren', () => {
    const input = items([2, 0, 1]);
    const out = sortByOrder(input);
    expect(out.map((e) => e.order)).toEqual([0, 1, 2]);
    expect(input.map((e) => e.order)).toEqual([2, 0, 1]); // unverändert
  });
});

describe('moveInArray', () => {
  it('verschiebt nach oben', () => {
    expect(moveInArray(['a', 'b', 'c'], 1, 'up')).toEqual(['b', 'a', 'c']);
  });
  it('verschiebt nach unten', () => {
    expect(moveInArray(['a', 'b', 'c'], 1, 'down')).toEqual(['a', 'c', 'b']);
  });
  it('gibt null am oberen Rand zurück', () => {
    expect(moveInArray(['a', 'b'], 0, 'up')).toBeNull();
  });
  it('gibt null am unteren Rand zurück', () => {
    expect(moveInArray(['a', 'b'], 1, 'down')).toBeNull();
  });
});

describe('moveAndRenumber', () => {
  it('verschiebt um genau eine Position nach oben (#29: kein zufälliges Springen)', () => {
    const list = items([0, 1, 2, 3]); // id0..id3
    const out = moveAndRenumber(list, 'id2', 'up');
    expect(out?.map((e) => e.id)).toEqual(['id0', 'id2', 'id1', 'id3']);
    expect(out?.map((e) => e.order)).toEqual([0, 1, 2, 3]); // lückenlos
  });

  it('verschiebt um genau eine Position nach unten', () => {
    const list = items([0, 1, 2, 3]);
    const out = moveAndRenumber(list, 'id1', 'down');
    expect(out?.map((e) => e.id)).toEqual(['id0', 'id2', 'id1', 'id3']);
  });

  it('ist robust gegen kaputte/doppelte order-Werte (Kern des Bugs)', () => {
    // Alle order=5 (kaputt). Anzeige-Reihenfolge = Array-Reihenfolge.
    const list = [
      { id: 'a', order: 5 },
      { id: 'b', order: 5 },
      { id: 'c', order: 5 },
    ];
    const out = moveAndRenumber(list, 'c', 'up');
    expect(out?.map((e) => e.id)).toEqual(['a', 'c', 'b']);
    expect(out?.map((e) => e.order)).toEqual([0, 1, 2]); // jetzt sauber
  });

  it('gibt null zurück am Rand', () => {
    const list = items([0, 1, 2]);
    expect(moveAndRenumber(list, 'id0', 'up')).toBeNull();
    expect(moveAndRenumber(list, 'id2', 'down')).toBeNull();
  });

  it('gibt null zurück bei unbekannter id', () => {
    expect(moveAndRenumber(items([0, 1]), 'xxx', 'up')).toBeNull();
  });

  it('mutiert die Eingabe nicht', () => {
    const list = items([0, 1, 2]);
    moveAndRenumber(list, 'id0', 'down');
    expect(list.map((e) => e.order)).toEqual([0, 1, 2]);
  });
});
