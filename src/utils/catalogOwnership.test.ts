import { describe, expect, it } from 'vitest';
import type { CollectionItem } from '../types/models';
import {
  cardOwnership,
  catalogSetKey,
  parseCatalogSetKey,
  coerceOwnedMap,
  linkedItemsByCard,
  ownedCountBySet,
  summarizeSetOwnership,
  toggleOwned,
} from './catalogOwnership';

const item = (id: string, cardId: string, total: number, variant?: 'normal' | 'reverse'): CollectionItem =>
  ({
    id,
    categoryId: 'singles',
    values: { total },
    catalog: { cardId, setId: 'sv03.5', ...(variant ? { variant } : {}) },
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as CollectionItem;

const total = (i: CollectionItem) => i.values.total as number;

describe('toggleOwned', () => {
  it('setzt und entfernt Haken und räumt leere Sets auf', () => {
    let map = toggleOwned({}, 'sv03.5', 'sv03.5-006', 'reverse');
    map = toggleOwned(map, 'sv03.5', 'sv03.5-006', 'normal');
    expect(map).toEqual({ 'sv03.5': { 'sv03.5-006': ['normal', 'reverse'] } });
    map = toggleOwned(map, 'sv03.5', 'sv03.5-006', 'normal');
    expect(map['sv03.5']['sv03.5-006']).toEqual(['reverse']);
    expect(toggleOwned(map, 'sv03.5', 'sv03.5-006', 'reverse')).toEqual({});
  });

  it('verändert die übergebene Map nicht', () => {
    const map = { a: { 'a-1': ['normal' as const] } };
    toggleOwned(map, 'a', 'a-1', 'normal');
    expect(map).toEqual({ a: { 'a-1': ['normal'] } });
  });
});

describe('coerceOwnedMap', () => {
  it('verwirft Unbrauchbares', () => {
    expect(coerceOwnedMap(null)).toEqual({});
    expect(
      coerceOwnedMap({ a: { 'a-1': ['reverse', 'quatsch', 'normal'], 'a-2': [], 'a-3': 'x' }, b: 5 })
    ).toEqual({ a: { 'a-1': ['normal', 'reverse'] } });
  });
});

describe('Besitz aus Haken und Einträgen', () => {
  const items = [item('i1', 'sv03.5-199', 290), item('i2', 'sv03.5-001', 1, 'reverse'), item('x', 'other-1', 5)];
  items[2].catalog!.setId = 'other';

  it('gruppiert verknüpfte Einträge nach Karte', () => {
    expect(Object.keys(linkedItemsByCard(items, 'sv03.5'))).toEqual(['sv03.5-199', 'sv03.5-001']);
  });

  it('zählt Karten je Set ohne Doppelte', () => {
    const owned = { 'sv03.5': { 'sv03.5-199': ['normal' as const], 'sv03.5-002': ['normal' as const] } };
    expect(ownedCountBySet(owned, items)).toEqual({ 'sv03.5': 3, other: 1 });
  });

  it('führt Haken und Einträge je Fassung zusammen', () => {
    expect(cardOwnership(['normal'], [items[1]])).toMatchObject({
      variants: ['normal', 'reverse'],
      entryVariants: ['reverse'],
    });
  });

  it('errechnet den Setwert ohne Doppelzählung', () => {
    const cards = [
      { id: 'sv03.5-199', price: { trend: 317, reverseTrend: null, hasReverse: false } },
      { id: 'sv03.5-001', price: { trend: 0.17, reverseTrend: 0.39, hasReverse: true } },
      { id: 'sv03.5-002', price: { trend: 0.18, reverseTrend: 0.46, hasReverse: true } },
      { id: 'sv03.5-003' },
    ];
    const checked = {
      'sv03.5-199': ['normal' as const], // hat zusätzlich einen Eintrag → Eintrag gewinnt
      'sv03.5-001': ['normal' as const],
      'sv03.5-002': ['normal' as const, 'reverse' as const],
    };
    const s = summarizeSetOwnership(cards, checked, linkedItemsByCard(items, 'sv03.5'), total);
    expect(s).toMatchObject({
      total: 4,
      ownedCards: 3,
      reverseTotal: 2,
      reverseOwned: 2,
      entryValue: 291,
      catalogValue: 0.81, // 0,17 + 0,18 + 0,46
      complete: false,
    });
  });

  it('meldet ein vollständiges Master Set erst mit allen Reverse-Fassungen', () => {
    const cards = [{ id: 'a-1', price: { trend: 1, reverseTrend: 2, hasReverse: true } }];
    expect(summarizeSetOwnership(cards, { 'a-1': ['normal'] }, {}, total).complete).toBe(false);
    expect(summarizeSetOwnership(cards, { 'a-1': ['normal', 'reverse'] }, {}, total).complete).toBe(true);
  });

  it('zählt abgehakte Karten ohne Katalogpreis separat', () => {
    const cards = [{ id: 'a-1', price: { trend: null, reverseTrend: null, hasReverse: false } }];
    expect(summarizeSetOwnership(cards, { 'a-1': ['normal'] }, {}, total)).toMatchObject({
      catalogValue: 0,
      unpriced: 1,
    });
  });
});

describe('Sprachen', () => {
  it('führt deutsche Sets unter der Kennung, andere mit Sprachpräfix', () => {
    expect(catalogSetKey('base1')).toBe('base1');
    expect(catalogSetKey('base1', 'en')).toBe('en:base1');
    expect(parseCatalogSetKey('ja:SV2a')).toEqual({ lang: 'ja', setId: 'SV2a' });
    expect(parseCatalogSetKey('sv03.5')).toEqual({ lang: 'de', setId: 'sv03.5' });
  });

  it('trennt Besitz gleicher Set-Kennungen nach Sprache', () => {
    const german = item('d', 'base1-4', 400);
    german.catalog = { cardId: 'base1-4', setId: 'base1' };
    const english = item('e', 'base1-4', 300);
    english.catalog = { cardId: 'base1-4', setId: 'base1', lang: 'en' };
    const all = [german, english];
    expect(linkedItemsByCard(all, 'base1')['base1-4'].map((i) => i.id)).toEqual(['d']);
    expect(linkedItemsByCard(all, 'base1', 'en')['base1-4'].map((i) => i.id)).toEqual(['e']);
    expect(ownedCountBySet({ 'ja:SV2a': { 'SV2a-201': ['normal'] } }, all)).toEqual({
      base1: 1,
      'en:base1': 1,
      'ja:SV2a': 1,
    });
  });
});
