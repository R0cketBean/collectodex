// Kartenscanner, Stapel-Modus (#171): gescannte Karten sammeln, Anzahl und
// Fassung anpassen, Gesamtwert sehen und am Ende gesammelt übernehmen.
// Reine Funktionen ohne React und Browser, damit sie testbar bleiben und
// später auch in einer mobilen App laufen können (#173).

import type { CatalogLang, CatalogVariant } from '../types/models';
import { pickCatalogPrice, type PriceBasis } from './catalogSettings';

export interface StackPrice {
  trend: number | null;
  low: number | null;
  avg30: number | null;
  reverseTrend: number | null;
  reverseLow: number | null;
  idProduct: number | null;
}

export interface StackEntry {
  /** Karte + Sprache + Fassung; gleiche Karten werden zusammengezählt. */
  key: string;
  cardId: string;
  setId: string;
  setName: string;
  localId: string;
  name: string;
  image?: string;
  lang: CatalogLang;
  variant: CatalogVariant;
  quantity: number;
  /** Cardmarket-Preise; `null`, wenn keine bekannt sind, fehlt, solange sie laden. */
  price?: StackPrice | null;
  /** Ob es die Karte als Reverse Holo gibt (aus den Kartendetails). */
  hasReverse?: boolean;
}

export type NewStackEntry = Omit<StackEntry, 'key' | 'quantity'> & { quantity?: number };

export const stackKey = (e: Pick<StackEntry, 'cardId' | 'lang' | 'variant'>) => `${e.lang}:${e.cardId}:${e.variant}`;

/** Fügt eine Karte hinzu; liegt sie schon im Stapel, erhöht sich die Anzahl. Neueste zuerst. */
export const addToStack = (stack: StackEntry[], entry: NewStackEntry): StackEntry[] => {
  const key = stackKey(entry);
  const quantity = Math.max(1, Math.floor(entry.quantity ?? 1));
  const existing = stack.find((e) => e.key === key);
  if (existing) {
    const merged = { ...existing, quantity: existing.quantity + quantity };
    return [merged, ...stack.filter((e) => e.key !== key)];
  }
  return [{ ...entry, key, quantity }, ...stack];
};

/** Anzahl setzen; 0 oder weniger entfernt die Karte. */
export const setQuantity = (stack: StackEntry[], key: string, quantity: number): StackEntry[] =>
  quantity < 1
    ? stack.filter((e) => e.key !== key)
    : stack.map((e) => (e.key === key ? { ...e, quantity: Math.floor(quantity) } : e));

/** Fassung ändern; gibt es die Karte in der neuen Fassung schon, werden beide zusammengelegt. */
export const setVariant = (stack: StackEntry[], key: string, variant: CatalogVariant): StackEntry[] => {
  const entry = stack.find((e) => e.key === key);
  if (!entry || entry.variant === variant) return stack;
  const nextKey = stackKey({ ...entry, variant });
  const target = stack.find((e) => e.key === nextKey);
  if (target) {
    return stack
      .filter((e) => e.key !== key)
      .map((e) => (e.key === nextKey ? { ...e, quantity: e.quantity + entry.quantity } : e));
  }
  return stack.map((e) => (e.key === key ? { ...e, variant, key: nextKey } : e));
};

/** Preise nachtragen, sobald sie geladen sind. */
export const setPrice = (
  stack: StackEntry[],
  cardId: string,
  lang: CatalogLang,
  price: StackPrice | null,
  hasReverse: boolean
): StackEntry[] =>
  stack.map((e) => (e.cardId === cardId && e.lang === lang ? { ...e, price, hasReverse } : e));

/**
 * Stückpreis der gewählten Fassung nach der eingestellten Preisbasis (Trend,
 * günstigstes Angebot, 30-Tage-Schnitt) – wie der Startwert neuer Einträge.
 * Ohne Reverse-Preis gilt der normale.
 */
export const unitPrice = (e: Pick<StackEntry, 'price' | 'variant'>, basis: PriceBasis = 'trend'): number | null => {
  if (!e.price) return null;
  const variant = e.variant === 'reverse' && e.price.reverseTrend !== null ? 'reverse' : 'normal';
  return pickCatalogPrice(e.price, basis, variant);
};

export interface StackTotals {
  /** Anzahl Karten (mit Mehrfachen). */
  cards: number;
  /** Summe nach Preisbasis. */
  value: number;
  /** Karten ohne bekannten Preis (zählen nicht zur Summe). */
  unpriced: number;
}

export const stackTotals = (stack: StackEntry[], basis: PriceBasis = 'trend'): StackTotals =>
  stack.reduce<StackTotals>(
    (t, e) => {
      const price = unitPrice(e, basis);
      return {
        cards: t.cards + e.quantity,
        value: Math.round((t.value + (price ?? 0) * e.quantity) * 100) / 100,
        unpriced: t.unpriced + (price === null ? e.quantity : 0),
      };
    },
    { cards: 0, value: 0, unpriced: 0 }
  );

/** Gespeicherten Stapel prüfen (z. B. aus localStorage); Unbrauchbares fällt weg. */
export const parseStack = (raw: unknown): StackEntry[] => {
  if (!Array.isArray(raw)) return [];
  const isLang = (v: unknown): v is CatalogLang => v === 'de' || v === 'en' || v === 'ja';
  return raw.flatMap((e): StackEntry[] => {
    if (!e || typeof e !== 'object') return [];
    const r = e as Record<string, unknown>;
    const str = (k: string) => (typeof r[k] === 'string' ? (r[k] as string) : '');
    if (!str('cardId') || !str('setId') || !isLang(r.lang)) return [];
    const variant: CatalogVariant = r.variant === 'reverse' ? 'reverse' : 'normal';
    const quantity = typeof r.quantity === 'number' && r.quantity >= 1 ? Math.floor(r.quantity) : 1;
    const entry: StackEntry = {
      key: '',
      cardId: str('cardId'),
      setId: str('setId'),
      setName: str('setName'),
      localId: str('localId'),
      name: str('name'),
      image: str('image') || undefined,
      lang: r.lang,
      variant,
      quantity,
      price: r.price && typeof r.price === 'object' ? (r.price as StackPrice) : undefined,
      hasReverse: typeof r.hasReverse === 'boolean' ? r.hasReverse : undefined,
    };
    return [{ ...entry, key: stackKey(entry) }];
  });
};
