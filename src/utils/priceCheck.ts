// Preis-Check (#125): Welche Einträge brauchen als Nächstes einen frischen
// Preis? Der maßgebliche Wert bleibt der vom Nutzer gepflegte; der Katalogpreis
// dient nur als Hinweis, wo sich etwas bewegt hat.

import type { CollectionItem } from '../types/models';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Tage seit der letzten Preisprüfung; null, wenn nie geprüft. */
export const daysSinceCheck = (item: Pick<CollectionItem, 'valueCheckedAt'>, now = new Date()): number | null => {
  if (!item.valueCheckedAt) return null;
  const then = Date.parse(item.valueCheckedAt);
  if (!Number.isFinite(then)) return null;
  return Math.max(0, Math.floor((now.getTime() - then) / DAY_MS));
};

export const isDue = (item: Pick<CollectionItem, 'valueCheckedAt'>, dueAfterDays: number, now = new Date()) => {
  const days = daysSinceCheck(item, now);
  return days === null || days >= dueAfterDays;
};

/** Älteste Prüfung zuerst, nie geprüfte ganz vorn; bei Gleichstand der höhere Wert zuerst. */
export const sortByCheckAge = <T extends CollectionItem>(items: T[], now = new Date()): T[] =>
  [...items].sort((a, b) => {
    const da = daysSinceCheck(a, now);
    const db = daysSinceCheck(b, now);
    if (da !== db) return (db ?? Infinity) - (da ?? Infinity);
    return (Number(b.values?.currentValue) || 0) - (Number(a.values?.currentValue) || 0);
  });

/** Abweichung des Katalogpreises vom gepflegten Wert in Prozent; null, wenn nicht berechenbar. */
export const deviationPercent = (current: unknown, catalog: number | null | undefined): number | null => {
  const value = Number(current);
  if (!Number.isFinite(value) || value <= 0 || typeof catalog !== 'number') return null;
  return Math.round(((catalog - value) / value) * 100);
};

export const formatCheckAge = (days: number | null): string =>
  days === null ? 'nie geprüft' : days === 0 ? 'heute' : days === 1 ? 'gestern' : `vor ${days} Tagen`;
