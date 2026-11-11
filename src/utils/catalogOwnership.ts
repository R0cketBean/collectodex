// Besitz im Kartenkatalog.
//
// Zwei Quellen zählen als „vorhanden“:
//  1. Haken im Katalog (OwnedMap) – leichtgewichtig, ohne Sammlungseintrag.
//  2. Sammlungseinträge, die mit einer Katalogkarte verknüpft sind
//     (CollectionItem.catalog).
// Der Wert eines Sets wird daraus errechnet: verknüpfte Einträge zählen mit
// ihrem gepflegten Wert, nur abgehakte Karten mit dem Katalogpreis. Jede
// Karte/Fassung zählt dabei genau einmal – der Eintrag hat Vorrang.

import type { CatalogLang, CatalogRef, CatalogVariant, CollectionItem } from '../types/models';

/**
 * Set-Schlüssel → cardId → abgehakte Fassungen. Der Schlüssel ist für Deutsch
 * die Set-Kennung selbst (so lagen die Daten schon vor), für andere Sprachen
 * steht die Sprache davor – siehe `catalogSetKey`.
 */
export type OwnedMap = Record<string, Record<string, CatalogVariant[]>>;

/** Schlüssel, unter dem Besitz und Fortschritt eines Sets geführt werden. */
export const catalogSetKey = (setId: string, lang: CatalogLang | undefined = 'de') =>
  lang === 'de' ? setId : `${lang}:${setId}`;

const VARIANTS: CatalogVariant[] = ['normal', 'reverse'];

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Zerlegt einen Set-Schlüssel wieder in Sprache und Set-Kennung. */
export const parseCatalogSetKey = (key: string): { lang: CatalogLang; setId: string } => {
  const match = /^(en|ja):(.+)$/.exec(key);
  return match ? { lang: match[1] as CatalogLang, setId: match[2] } : { lang: 'de', setId: key };
};

/** Bereinigt gespeicherte/importierte Daten; Unbrauchbares fällt weg. */
export const coerceOwnedMap = (raw: unknown): OwnedMap => {
  const result: OwnedMap = {};
  if (!isObject(raw)) return result;
  for (const [setId, cards] of Object.entries(raw)) {
    if (!isObject(cards)) continue;
    for (const [cardId, variants] of Object.entries(cards)) {
      if (!Array.isArray(variants)) continue;
      const clean = VARIANTS.filter((v) => variants.includes(v));
      if (clean.length > 0) (result[setId] ??= {})[cardId] = clean;
    }
  }
  return result;
};

/** Setzt oder entfernt den Haken für eine Fassung (liefert eine neue Map). */
export const toggleOwned = (
  map: OwnedMap,
  setId: string,
  cardId: string,
  variant: CatalogVariant
): OwnedMap => {
  const current = map[setId]?.[cardId] ?? [];
  const nextVariants = current.includes(variant)
    ? current.filter((v) => v !== variant)
    : VARIANTS.filter((v) => v === variant || current.includes(v));
  const cards = { ...(map[setId] ?? {}) };
  if (nextVariants.length > 0) cards[cardId] = nextVariants;
  else delete cards[cardId];
  const next = { ...map };
  if (Object.keys(cards).length > 0) next[setId] = cards;
  else delete next[setId];
  return next;
};

const variantOf = (ref: CatalogRef): CatalogVariant => ref.variant ?? 'normal';

/** Verknüpfte Sammlungseinträge eines Sets, nach Karten-ID gruppiert. */
export const linkedItemsByCard = (
  items: CollectionItem[],
  setId: string,
  lang: CatalogLang = 'de'
): Record<string, CollectionItem[]> => {
  const result: Record<string, CollectionItem[]> = {};
  for (const item of items) {
    if (item.catalog?.setId === setId && (item.catalog.lang ?? 'de') === lang) {
      (result[item.catalog.cardId] ??= []).push(item);
    }
  }
  return result;
};

/** Anzahl vorhandener Karten je Set-Schlüssel (Haken und verknüpfte Einträge, ohne Doppelte). */
export const ownedCountBySet = (owned: OwnedMap, items: CollectionItem[]): Record<string, number> => {
  const sets: Record<string, Set<string>> = {};
  for (const [setKey, cards] of Object.entries(owned)) {
    for (const cardId of Object.keys(cards)) (sets[setKey] ??= new Set()).add(cardId);
  }
  for (const item of items) {
    if (item.catalog) {
      (sets[catalogSetKey(item.catalog.setId, item.catalog.lang)] ??= new Set()).add(item.catalog.cardId);
    }
  }
  return Object.fromEntries(Object.entries(sets).map(([setId, ids]) => [setId, ids.size]));
};

export interface CardOwnership {
  /** Fassungen, die per Haken ODER Eintrag vorhanden sind. */
  variants: CatalogVariant[];
  /** Fassungen, die durch einen Sammlungseintrag abgedeckt sind. */
  entryVariants: CatalogVariant[];
  items: CollectionItem[];
}

export const cardOwnership = (
  checked: CatalogVariant[] | undefined,
  items: CollectionItem[] | undefined
): CardOwnership => {
  const linked = items ?? [];
  const entryVariants = VARIANTS.filter((v) => linked.some((i) => i.catalog && variantOf(i.catalog) === v));
  const variants = VARIANTS.filter((v) => entryVariants.includes(v) || (checked ?? []).includes(v));
  return { variants, entryVariants, items: linked };
};

export interface SetCardInfo {
  id: string;
  /** Katalogpreise; `undefined`, solange die Kartendetails noch laden. */
  price?: { trend: number | null; reverseTrend: number | null; hasReverse: boolean };
}

export interface SetOwnershipSummary {
  total: number;
  ownedCards: number;
  /** Karten, die es zusätzlich als Reverse Holo gibt (soweit schon geladen). */
  reverseTotal: number;
  reverseOwned: number;
  /** Summe der Gesamtwerte der verknüpften Sammlungseinträge. */
  entryValue: number;
  /** Katalogpreis der nur abgehakten Karten/Fassungen. */
  catalogValue: number;
  /** Abgehakte Fassungen ohne Katalogpreis (im Katalogwert nicht enthalten). */
  unpriced: number;
  /** Alle Karten und alle Reverse-Holo-Fassungen vorhanden. */
  complete: boolean;
}

export const summarizeSetOwnership = (
  cards: SetCardInfo[],
  checked: Record<string, CatalogVariant[]> | undefined,
  linked: Record<string, CollectionItem[]>,
  itemTotalValue: (item: CollectionItem) => number
): SetOwnershipSummary => {
  const s: SetOwnershipSummary = {
    total: cards.length,
    ownedCards: 0,
    reverseTotal: 0,
    reverseOwned: 0,
    entryValue: 0,
    catalogValue: 0,
    unpriced: 0,
    complete: false,
  };
  let allLoaded = true;
  for (const card of cards) {
    const own = cardOwnership(checked?.[card.id], linked[card.id]);
    if (own.variants.length > 0) s.ownedCards += 1;
    for (const item of own.items) s.entryValue += itemTotalValue(item);
    if (!card.price) allLoaded = false;
    if (card.price?.hasReverse) {
      s.reverseTotal += 1;
      if (own.variants.includes('reverse')) s.reverseOwned += 1;
    }
    for (const variant of own.variants) {
      if (own.entryVariants.includes(variant)) continue;
      const price = variant === 'reverse' ? card.price?.reverseTrend : card.price?.trend;
      if (typeof price === 'number') s.catalogValue += price;
      else if (card.price) s.unpriced += 1;
    }
  }
  s.entryValue = Math.round(s.entryValue * 100) / 100;
  s.catalogValue = Math.round(s.catalogValue * 100) / 100;
  s.complete =
    s.total > 0 && allLoaded && s.ownedCards === s.total && s.reverseOwned === s.reverseTotal;
  return s;
};
