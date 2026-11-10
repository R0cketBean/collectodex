import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as StorageService from '../services/StorageService';
import type { CollectionItem } from '../types/models';
import { SAVE_DEBOUNCE_MS, useItems } from './useItems';

const KEY = StorageService.STORAGE_KEYS.ITEMS;
let setData: ReturnType<typeof vi.spyOn>;

const savedItems = (): CollectionItem[] | undefined => {
  const calls = setData.mock.calls.filter(([key]: unknown[]) => key === KEY);
  return calls.length ? (calls[calls.length - 1][1] as CollectionItem[]) : undefined;
};
const saveCount = () => setData.mock.calls.filter(([key]: unknown[]) => key === KEY).length;
const wait = () => act(() => void vi.advanceTimersByTime(SAVE_DEBOUNCE_MS + 10));

beforeEach(() => {
  vi.useFakeTimers();
  setData = vi.spyOn(StorageService, 'setData').mockResolvedValue(undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useItems – Speicherung', () => {
  it('schreibt mehrere schnelle Änderungen entprellt als einen Vorgang', () => {
    const { result } = renderHook(() => useItems());
    let id = '';
    act(() => {
      id = result.current.addItem('singles', { name: 'Glurak', quantity: 1 });
    });
    act(() => result.current.updateItem(id, { quantity: 2 }));
    act(() => result.current.addLinkToItem(id, 'product', 'cardmarket.com/x'));
    expect(saveCount()).toBe(0);
    wait();
    expect(saveCount()).toBe(1);
    expect(savedItems()).toHaveLength(1);
    expect(savedItems()![0]).toMatchObject({
      id,
      values: { name: 'Glurak', quantity: 2 },
      links: { product: 'https://cardmarket.com/x' },
    });
  });

  it('überschreibt den Speicher nicht mit einer leeren Liste, solange nie Einträge da waren', () => {
    const { result } = renderHook(() => useItems());
    wait();
    act(() => result.current.setItems([]));
    wait();
    expect(saveCount()).toBe(0);
  });

  it('speichert die leere Liste, wenn der letzte Eintrag gelöscht wurde', () => {
    const { result } = renderHook(() => useItems());
    let id = '';
    act(() => {
      id = result.current.addItem('singles', { name: 'A' });
    });
    wait();
    act(() => result.current.deleteItem(id));
    wait();
    expect(savedItems()).toEqual([]);
  });

  it('schreibt eine ausstehende Änderung sofort, wenn das Fenster schließt', () => {
    const { result } = renderHook(() => useItems());
    act(() => void result.current.addItem('singles', { name: 'A' }));
    expect(saveCount()).toBe(0);
    act(() => void window.dispatchEvent(new Event('beforeunload')));
    expect(saveCount()).toBe(1);
    wait();
    expect(saveCount()).toBe(1);
  });
});

describe('useItems – Änderungen', () => {
  const setup = () => {
    const hook = renderHook(() => useItems());
    let a = '';
    let b = '';
    act(() => {
      a = hook.result.current.addItem('singles', { name: 'A', quantity: 1 }, { links: { product: 'https://x/a' } });
      b = hook.result.current.addItem('sealed', { name: 'B', quantity: 1 });
    });
    const get = (id: string) => hook.result.current.items.find((i) => i.id === id)!;
    return { ...hook, a, b, get };
  };

  it('ändert nur die genannten Werte und lässt andere Einträge unberührt', () => {
    const { result, a, b, get } = setup();
    const before = get(b);
    act(() => result.current.updateItem(a, { quantity: 5 }));
    expect(get(a).values).toEqual({ name: 'A', quantity: 5 });
    expect(get(b)).toBe(before);
  });

  it('bearbeitet mehrere Einträge in einem Schritt und löscht mehrere', () => {
    const { result, a, b, get } = setup();
    act(() => result.current.updateMultipleItems([a, b], { language: 'deutsch' }));
    expect(get(a).values.language).toBe('deutsch');
    expect(get(b).values).toEqual({ name: 'B', quantity: 1, language: 'deutsch' });
    act(() => result.current.deleteMultipleItems([a, b]));
    expect(result.current.items).toEqual([]);
  });

  it('setzt, ersetzt und entfernt Links; eine leere URL entfernt den Link', () => {
    const { result, a, get } = setup();
    act(() => result.current.addLinkToItem(a, 'product', '  www.cardmarket.com/neu '));
    expect(get(a).links).toEqual({ product: 'https://www.cardmarket.com/neu' });
    act(() => result.current.addLinkToItem(a, 'name', 'https://x/n'));
    act(() => result.current.addLinkToItem(a, 'product', '   '));
    expect(get(a).links).toEqual({ name: 'https://x/n' });
    act(() => result.current.removeLinkFromItem(a, 'name'));
    expect(get(a).links).toBeUndefined();
  });

  it('setzt und entfernt Bilder', () => {
    const { result, a, get } = setup();
    act(() => result.current.addImageToItem(a, 'image', 'cdx-image://local/v.webp'));
    act(() => result.current.addImageToItem(a, 'imageBack', 'cdx-image://local/r.webp'));
    act(() => result.current.removeImageFromItem(a, 'image'));
    expect(get(a).images).toEqual({ imageBack: 'cdx-image://local/r.webp' });
    act(() => result.current.removeImageFromItem(a, 'imageBack'));
    expect(get(a).images).toBeUndefined();
  });

  it('verknüpft Einträge mit Katalogkarten und löst die Verknüpfung wieder', () => {
    const { result, a, b, get } = setup();
    const untouched = get(b);
    act(() => result.current.setItemCatalogRefs({ [a]: { cardId: 'base1-4', setId: 'base1', variant: 'normal' } }));
    expect(get(a).catalog).toEqual({ cardId: 'base1-4', setId: 'base1', variant: 'normal' });
    expect(get(a).links).toEqual({ product: 'https://x/a' });
    expect(get(b)).toBe(untouched);
    act(() => result.current.setItemCatalogRefs({ [a]: null }));
    expect('catalog' in get(a)).toBe(false);
  });

  it('entfernt beim Löschen einer Kategorie deren Einträge', () => {
    const { result, a } = setup();
    act(() => result.current.deleteItemsByCategory('sealed'));
    expect(result.current.items.map((i) => i.id)).toEqual([a]);
    expect(result.current.getItemsByCategoryId('singles')).toHaveLength(1);
  });
});
