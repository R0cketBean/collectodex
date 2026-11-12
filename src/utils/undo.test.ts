import { describe, expect, it } from 'vitest';
import type { CollectionItem } from '../types/models';
import { captureChanged, captureRemoved, restoreChanged, restoreRemoved } from './undo';

const item = (id: string, name = id): CollectionItem =>
  ({ id, categoryId: 'singles', values: { name }, createdAt: new Date(), updatedAt: new Date() }) as CollectionItem;

const ids = (items: CollectionItem[]) => items.map((i) => i.id);

describe('Löschen rückgängig machen', () => {
  const all = [item('a'), item('b'), item('c'), item('d')];

  it('setzt gelöschte Einträge an ihre alte Stelle zurück', () => {
    const removed = captureRemoved(all, ['b', 'd']);
    const rest = all.filter((i) => !['b', 'd'].includes(i.id));
    expect(ids(restoreRemoved(rest, removed))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('behält Einträge, die nach dem Löschen dazukamen', () => {
    const removed = captureRemoved(all, ['a']);
    const later = [...all.filter((i) => i.id !== 'a'), item('neu')];
    expect(ids(restoreRemoved(later, removed))).toEqual(['a', 'b', 'c', 'd', 'neu']);
  });

  it('fügt nichts doppelt ein und kommt mit einer kürzeren Liste zurecht', () => {
    const removed = captureRemoved(all, ['d']);
    expect(restoreRemoved(all, removed)).toBe(all);
    expect(ids(restoreRemoved([item('a')], removed))).toEqual(['a', 'd']);
  });
});

describe('Massenbearbeitung rückgängig machen', () => {
  it('stellt nur die geänderten Einträge wieder her', () => {
    const all = [item('a', 'alt A'), item('b', 'alt B'), item('c', 'alt C')];
    const before = captureChanged(all, ['a', 'b']);
    const edited = all.map((i) => ({ ...i, values: { name: `neu ${i.id}` } }));
    expect(restoreChanged(edited, before).map((i) => i.values.name)).toEqual(['alt A', 'alt B', 'neu c']);
  });

  it('holt inzwischen gelöschte Einträge nicht zurück', () => {
    const all = [item('a'), item('b')];
    const before = captureChanged(all, ['a', 'b']);
    expect(ids(restoreChanged([all[1]], before))).toEqual(['b']);
  });
});
